'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Volume2, VolumeX } from 'lucide-react';
import { FloatingMic } from "@/components/floating-mic";
import { motion, AnimatePresence } from "framer-motion";
import { StockPanel } from "@/components/stock-panel";
import wizardLogo from "@/images/wizard.png";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STARTER_PROMPTS = [
  // Inner ring prompts (5 instead of 8)
  "Help me research Apple stock",
  "Explain Bitcoin's performance",
  "Compare Tesla and Ford stocks",
  "Research renewable energy",
  "Analyze S&P 500 trends",
  // Outer ring prompts (unchanged)
  "Show me growth stocks",
  "Explain stock options",
  "Compare index funds",
  "Tech stocks",
  "Research penny stocks",
  "Explain bond yields",
  "Show emerging markets",
  "Crypto trends",
  "Research gold prices",
  "Analyze real estate",
  "Show market trends",
  "Commodities"
];

export function GroqChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [isInitialState, setIsInitialState] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastMessageRef = useRef<Message | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const audioQueue = useRef<HTMLAudioElement[]>([]);
  const isProcessingAudio = useRef(false);

  useEffect(() => {
    // Set initial window size
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight
    });

    // Handle window resize
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Effect to handle body scroll
  useEffect(() => {
    if (isInitialState) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isInitialState]);

  // Add effect to scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup all audio elements on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      audioQueue.current.forEach(audio => {
        audio.pause();
        URL.revokeObjectURL(audio.src);
      });
      audioQueue.current = [];
    };
  }, []);

  const startConversation = (prompt?: string) => {
    setIsInitialState(false);
    if (prompt) {
      handleStarterPrompt(prompt);
    }
  };

  const handleStarterPrompt = async (prompt: string) => {
    setMessages([{ role: 'user', content: prompt }]);
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/groq-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(response.statusText);

      await handleStreamResponse(response, (content) => {
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1]?.role === 'assistant') {
            newMessages[newMessages.length - 1].content = content;
          } else {
            newMessages.push({ role: 'assistant', content });
          }
          return newMessages;
        });
      });

    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to handle automatic playback of new messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage;
      // Don't automatically play the message - it will be handled by the streaming logic
    }
  }, [messages]);

  // Add retry utility
  const retryWithBackoff = async <T,>(
    operation: () => Promise<T>,
    retries = 3,
    delay = 1000,
    backoffRate = 2
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying operation, ${retries} attempts remaining`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryWithBackoff(operation, retries - 1, delay * backoffRate, backoffRate);
      }
      throw error;
    }
  };

  const playNextInQueue = async () => {
    if (isProcessingAudio.current || audioQueue.current.length === 0) return;
    
    isProcessingAudio.current = true;
    const audio = audioQueue.current[0];
    audioRef.current = audio;
    setIsPlaying(true);

    try {
      await retryWithBackoff(async () => {
        try {
          await audio.play();
          // Wait for audio to finish
          await new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = (e) => {
              console.error("Audio playback error event:", e);
              reject(e);
            };
          });
        } catch (error) {
          console.error("Audio playback attempt failed:", error);
          throw error;
        }
      }, 3, 500);
    } catch (error) {
      console.error("All audio playback retries failed:", error);
    } finally {
      if (audioRef.current === audio) {
        try {
          URL.revokeObjectURL(audio.src);
          audioQueue.current.shift();
          audioRef.current = null;
          setIsPlaying(false);
          isProcessingAudio.current = false;
          // Play next in queue if available
          if (audioQueue.current.length > 0) {
            await playNextInQueue();
          }
        } catch (error) {
          console.error("Error in audio cleanup:", error);
        }
      }
    }
  };

  const queueAudioChunk = async (base64Audio: string) => {
    try {
      await retryWithBackoff(async () => {
        try {
          // Convert base64 to ArrayBuffer
          const binaryString = window.atob(base64Audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          try {
            // Create audio blob and audio element
            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            const audio = new Audio(URL.createObjectURL(audioBlob));
            
            try {
              // Add to queue
              audioQueue.current.push(audio);
              
              // Start playing if not already processing
              if (!isProcessingAudio.current) {
                await playNextInQueue();
              }
            } catch (error) {
              console.error("Error queuing or playing audio:", error);
              throw error;
            }
          } catch (error) {
            console.error("Error creating audio blob/element:", error);
            throw error;
          }
        } catch (error) {
          console.error("Error processing base64 audio:", error);
          throw error;
        }
      }, 3, 500);
    } catch (error) {
      console.error("Fatal error in audio chunk processing:", error);
    }
  };

  const handleStreamResponse = async (response: Response, onChunk: (content: string) => void) => {
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      let fullContent = "";
      let buffer = ""; // Buffer for incomplete chunks
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          try {
            // Append new data to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              if (!line.trim()) continue;

              try {
                const data = JSON.parse(line);
                
                switch (data.type) {
                  case "chunk":
                    try {
                      fullContent += data.content;
                      onChunk(fullContent);
                    } catch (error) {
                      console.error("Error processing text chunk:", error);
                    }
                    break;
                  case "audio":
                    try {
                      await queueAudioChunk(data.content);
                    } catch (error) {
                      console.error("Error processing audio chunk:", error);
                    }
                    break;
                  case "error":
                    console.error("Stream error:", data.content);
                    throw new Error(data.content);
                    break;
                  case "done":
                    return;
                }
              } catch (e) {
                console.error("Error parsing JSON chunk:", e, "Line:", line);
              }
            }
          } catch (error) {
            console.error("Error processing stream chunk:", error);
          }
        }
      } catch (error) {
        console.error("Error reading stream:", error);
        throw error;
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Fatal stream error:", error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    try {
      // Cleanup any existing audio
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current = null;
        } catch (error) {
          console.error("Error cleaning up existing audio:", error);
        }
      }
      setIsPlaying(false);
      
      // Add user message immediately
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      
      setIsLoading(true);
      try {
        const response = await fetch("/api/groq-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, { role: "user", content: userMessage }],
          }),
        });

        if (!response.ok) throw new Error(response.statusText);

        await handleStreamResponse(response, (content) => {
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages[newMessages.length - 1]?.role === 'assistant') {
              newMessages[newMessages.length - 1].content = content;
            } else {
              newMessages.push({ role: 'assistant', content });
            }
            return newMessages;
          });
        });

      } catch (error) {
        console.error("Error in API request:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I apologize, but I encountered an error. Please try again.",
          },
        ]);
      }
    } catch (error) {
      console.error("Fatal error in form submission:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranscription = async (text: string) => {
    if (!text.trim()) return;
    
    // Clear audio and stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/groq-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      await handleStreamResponse(response, (content) => {
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1]?.role === 'assistant') {
            newMessages[newMessages.length - 1].content = content;
          } else {
            newMessages.push({ role: 'assistant', content });
          }
          return newMessages;
        });
      });

    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I apologize, but I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAudio = async (text: string, index: number) => {
    if (audioRef.current && isPlaying) {
      // Stop all audio and clear queue
      audioRef.current.pause();
      audioRef.current = null;
      audioQueue.current.forEach(audio => {
        audio.pause();
        URL.revokeObjectURL(audio.src);
      });
      audioQueue.current = [];
      isProcessingAudio.current = false;
      setIsPlaying(false);
      setCurrentPlayingIndex(null);
    } else {
      setCurrentPlayingIndex(index);
      try {
        await retryWithBackoff(async () => {
          const response = await fetch("/api/text-to-speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.trim() }),
          });

          if (!response.ok) {
            throw new Error(`Failed to generate speech: ${response.status}`);
          }

          const audioBlob = await response.blob();
          const audio = new Audio(URL.createObjectURL(audioBlob));
          
          // Clear any existing queue
          audioQueue.current.forEach(a => {
            a.pause();
            URL.revokeObjectURL(a.src);
          });
          audioQueue.current = [audio];
          isProcessingAudio.current = false;
          
          // Start playing
          await playNextInQueue();
        }, 3, 1000);
      } catch (error) {
        console.error("Toggle audio error:", error);
        setCurrentPlayingIndex(null);
      }
    }
  };

  if (isInitialState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden"
           style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Logo in top left */}
        <div className="fixed top-0 left-0 z-50">
          <img src={wizardLogo.src} alt="Wizard Logo" className="w-12 h-12" />
        </div>
        {/* Starter prompts container */}
        <div className="fixed inset-0 pointer-events-none" style={{ overflow: 'hidden' }}>
          <div className="relative w-screen h-screen" style={{ overflow: 'hidden' }}>
            {STARTER_PROMPTS.map((prompt, index) => {
              const centerX = windowSize.width / 2;
              const centerY = (windowSize.height / 2) - (windowSize.height * 0.1); // Shift everything up by 10% of screen height
              
              // Calculate safe spacing based on screen dimensions
              const minDimension = Math.min(windowSize.width, windowSize.height);
              const safeArea = minDimension * 0.85;
              
              // Calculate ring radii with more symmetrical spacing
              const innerRadius = safeArea * 0.25; // Closer to microphone
              const outerRadius = safeArea * 0.45; // Slightly closer to inner ring
              
              // Calculate number of items in each ring
              const innerRingCount = 5; // First 5 prompts
              const outerRingCount = STARTER_PROMPTS.length - innerRingCount;
              
              let x, y;
              const isOuterRing = index >= innerRingCount;

              if (isOuterRing) {
                // Outer ring calculations - Perfect circle
                const outerIndex = index - innerRingCount;
                const angle = (outerIndex * (2 * Math.PI / outerRingCount)) + Math.PI / outerRingCount; // Offset by half spacing
                x = centerX + Math.cos(angle) * outerRadius;
                y = centerY + Math.sin(angle) * outerRadius;
              } else {
                // Inner ring calculations - Perfect pentagon
                const angle = (index * (2 * Math.PI / innerRingCount)) + Math.PI / innerRingCount; // Offset by half spacing
                x = centerX + Math.cos(angle) * innerRadius;
                y = centerY + Math.sin(angle) * innerRadius;
              }

              // No random offset for perfect spacing
              const offsetX = 0;
              const offsetY = 0;
              
              // Adjust bubble sizes for better spacing
              const bubbleWidth = isOuterRing ? 130 : 140; // Slightly smaller bubbles
              const halfBubble = bubbleWidth / 2;
              const margin = 20;
              
              // Ensure x stays within screen bounds
              x = Math.max(halfBubble + margin, Math.min(windowSize.width - halfBubble - margin, x + offsetX));
              // Ensure y stays within screen bounds
              y = Math.max(halfBubble + margin, Math.min(windowSize.height - halfBubble - margin, y + offsetY));

              return (
                <motion.div
                  key={prompt}
                  className="absolute pointer-events-auto"
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    transform: 'translate(-50%, -50%)',
                    width: isOuterRing ? 'min(130px, 10vw)' : 'min(140px, 10.5vw)', // Slightly smaller sizes
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ 
                    delay: index * 0.1, // Slightly faster animation for more bubbles
                    duration: 0.8,
                    type: "spring",
                    bounce: 0.3
                  }}
                >
                  {/* Outer glow and gradient ring */}
                  <div 
                    className="absolute inset-[-8px] rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 
                             blur-md opacity-40"
                  />
                  
                  {/* Main gradient background */}
                  <div 
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 via-pink-500 to-orange-500 
                             opacity-70"
                  />
                  
                  {/* Button with backdrop blur */}
                  <button
                    onClick={() => startConversation(prompt)}
                    className="relative w-full px-4 py-4 rounded-full transition-all duration-300
                             bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10
                             hover:from-violet-500/20 hover:to-fuchsia-500/20
                             border border-violet-500/20 hover:border-violet-500/40
                             text-primary backdrop-blur-sm shadow-lg hover:shadow-xl
                             text-lg font-medium hover:scale-105
                             flex items-center justify-center text-center min-h-[3.5rem]"
                    style={{
                      textShadow: '0 0 10px rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    <div className="relative z-10">
                      {prompt}
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Centered microphone */}
        <motion.div 
          className="fixed"
          style={{
            left: '50%',
            top: '40%', // Move microphone up to match the new center
            transform: 'translate(-50%, -50%)'
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.8 }}
          whileHover={{ scale: 1.1 }}
        >
          <FloatingMic 
            onTranscription={(text) => {
              startConversation();
              handleTranscription(text);
            }} 
            isLoading={isLoading}
            isInitial={true}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Card className="fixed left-0 top-0 bottom-0 w-1/2 flex flex-col
                      border-r border-violet-500/20 shadow-lg
                      bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5
                      backdrop-blur-sm rounded-none">
        <div className="p-4 border-b border-violet-500/20 flex items-center gap-4">
          <img src={wizardLogo.src} alt="Wizard Logo" className="w-8 h-8" />
          <h1 className="text-2xl font-semibold bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            Chat
          </h1>
        </div>
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-3 rounded-lg flex items-start gap-3 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20'
              } max-w-[80%]`}
            >
              {message.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0 relative group">
                  {/* Animated Glow effect */}
                  <div className="absolute inset-0 rounded-full bg-violet-500/40 blur-sm animate-pulse" />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
                    <path d="M12 2C11.4477 2 11 2.44772 11 3V11C11 11.5523 11.4477 12 12 12C12.5523 12 13 11.5523 13 11V3C13 2.44772 12.5523 2 12 2Z" fill="white"/>
                    <path d="M8 8C8 5.79086 9.79086 4 12 4C14.2091 4 16 5.79086 16 8V11C16 13.2091 14.2091 15 12 15C9.79086 15 8 13.2091 8 11V8Z" stroke="white" strokeWidth="2"/>
                    <path d="M7 11C7 14.3137 9.68629 17 13 17M13 17C16.3137 17 19 14.3137 19 11M13 17V21M13 21H16M13 21H10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
              <div className="flex-1">
                {message.content}
                {message.role === 'assistant' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 hover:bg-violet-500/10"
                    onClick={() => toggleAudio(message.content, index)}
                  >
                    {isPlaying && currentPlayingIndex === index ? 
                      <VolumeX className="h-4 w-4" /> : 
                      <Volume2 className="h-4 w-4" />
                    }
                  </Button>
                )}
              </div>
            </div>
          ))}
        </ScrollArea>
        <div className="p-4 border-t border-violet-500/20">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border-violet-500/20"
            />
            <Button type="submit" disabled={isLoading}
                    className="bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700">
              {isLoading ? 'Sending...' : 'Send'}
            </Button>
          </form>
        </div>
      </Card>
      <StockPanel />
      <div className="fixed bottom-8 right-8">
        <FloatingMic onTranscription={handleTranscription} isLoading={isLoading} />
      </div>
    </>
  );
} 