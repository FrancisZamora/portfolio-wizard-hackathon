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
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Dataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  fill: boolean;
  tension: number;
}

interface GraphContent {
  labels: string[];
  datasets: Dataset[];
  plotImage?: string;
}

interface GraphData {
  type: string;
  content: GraphContent;
}

interface Source {
  title: string;
  url: string;
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

const SourcesDisplay = ({ sources }: { sources: Source[] }) => {
  if (!sources?.length) return null;
  
  return (
    <div className="mt-4 p-4 rounded-lg bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border border-violet-500/20">
      <h3 className="font-medium mb-2 text-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">Sources:</h3>
      <ul className="space-y-2">
        {sources.map((source, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-sm flex-shrink-0">
              {index + 1}
            </span>
            <a 
              href={source.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-violet-500 hover:text-fuchsia-500 transition-colors duration-200 hover:underline"
            >
              {source.title || source.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const SearchingIndicator = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20"
  >
    <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    <span className="text-lg font-medium bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
      Researching...
    </span>
  </motion.div>
);

export function GroqChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [isInitialState, setIsInitialState] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastMessageRef = useRef<Message | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const audioQueue = useRef<HTMLAudioElement[]>([]);
  const isProcessingAudio = useRef(false);
  const pendingAudioChunks = useRef<string[]>([]);
  const isProcessingChunks = useRef(false);
  const processingPromise = useRef<Promise<void>>(Promise.resolve());
  const [currentGraph, setCurrentGraph] = useState<GraphData | null>(null);
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Add cleanup for the timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
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

  const processNextAudioChunk = async () => {
    if (pendingAudioChunks.current.length === 0) return;
    
    const base64Audio = pendingAudioChunks.current[0];
    
    try {
      // Create audio element
      const binaryString = window.atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
      const audio = new Audio();
      
      // Wait for audio to be loaded
      await new Promise((resolve, reject) => {
        audio.src = URL.createObjectURL(audioBlob);
        audio.oncanplay = resolve;
        audio.onerror = reject;
        audio.load();
      });
      
      // Add to queue and remove from pending
      audioQueue.current.push(audio);
      pendingAudioChunks.current.shift();
      
      // If this is the first audio in the queue and nothing is playing, start playback
      if (audioQueue.current.length === 1 && !isProcessingAudio.current) {
        await playNextInQueue();
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
      // Remove failed chunk and continue
      pendingAudioChunks.current.shift();
    }
  };


  const playNextInQueue = async () => {
    if (isProcessingAudio.current || audioQueue.current.length === 0) return;
    
    isProcessingAudio.current = true;
    const audio = audioQueue.current[0];
    audioRef.current = audio;
    setIsPlaying(true);

    try {
      await audio.play();
      // Wait for audio to finish
      await new Promise((resolve, reject) => {
        audio.onended = () => {
          resolve(undefined);
          // Cleanup current audio
          if (audioRef.current === audio) {
            URL.revokeObjectURL(audio.src);
            audioQueue.current.shift();
            audioRef.current = null;
            setIsPlaying(false);
            isProcessingAudio.current = false;
            // Play next in queue if available
            if (audioQueue.current.length > 0) {
              playNextInQueue();
            }
          }
        };
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          reject(e);
        };
      });
    } catch (error) {
      console.error("Audio playback error:", error);
      // Cleanup on error
      if (audioRef.current === audio) {
        URL.revokeObjectURL(audio.src);
        audioQueue.current.shift();
        audioRef.current = null;
        setIsPlaying(false);
        isProcessingAudio.current = false;
        // Try next audio if available
        if (audioQueue.current.length > 0) {
          playNextInQueue();
        }
      }
    }
  };

  const queueAudioChunk = async (base64Audio: string) => {
    try {
      console.log("[GROQ_CHAT_CLIENT] Starting audio chunk processing");
      await retryWithBackoff(async () => {
        try {
          console.log("[GROQ_CHAT_CLIENT] Converting base64 to audio");
          const binaryString = window.atob(base64Audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
          console.log("[GROQ_CHAT_CLIENT] Created audio blob, size:", audioBlob.size);
          const audio = new Audio(URL.createObjectURL(audioBlob));
          
          console.log("[GROQ_CHAT_CLIENT] Adding audio to queue");
          audioQueue.current.push(audio);
          
          if (!isProcessingAudio.current) {
            console.log("[GROQ_CHAT_CLIENT] Starting audio playback");
            await playNextInQueue();
          }
        } catch (error: any) {
          console.error("[GROQ_CHAT_CLIENT] Error in audio chunk processing:", {
            error: error.message,
            stack: error.stack
          });
          throw error;
        }
      }, 3, 500);
    } catch (error: any) {
      console.error("[GROQ_CHAT_CLIENT] Fatal error in audio chunk processing:", {
        error: error.message,
        stack: error.stack
      });
    }
  };

  const generateRandomGraph = () => {
    const labels = Array.from({ length: 10 }, (_, i) => `Point ${i + 1}`);
    const data = Array.from({ length: 10 }, () => Math.floor(Math.random() * 100));
    
    return {
      labels,
      datasets: [{
        label: 'Random Data',
        data,
        borderColor: 'rgb(139, 92, 246)',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4,
      }]
    };
  };

  const handleStreamResponse = async (response: Response, onChunk: (content: string) => void) => {
    try {
      console.log("[GROQ_CHAT_CLIENT] Starting stream response handling");
      const reader = response.body?.getReader();
      if (!reader) {
        console.error("[GROQ_CHAT_CLIENT] No reader available in response");
        throw new Error("No reader available");
      }

      let fullContent = "";
      let buffer = "";
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[GROQ_CHAT_CLIENT] Stream reading completed");
            break;
          }

          try {
            buffer += decoder.decode(value, { stream: true });
            console.log("[GROQ_CHAT_CLIENT] Received new data, buffer length:", buffer.length);

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              if (!line.trim()) continue;

              try {
                console.log("[GROQ_CHAT_CLIENT] Processing line:", line);
                const data = JSON.parse(line);

                switch (data.type) {
                  case "chunk":
                    console.log("[GROQ_CHAT_CLIENT] Processing text chunk");
                    fullContent += data.content;
                    onChunk(fullContent);
                    break;
                  case "graph":
                    console.log("[GROQ_CHAT_CLIENT] Processing graph data");
                    setCurrentGraph(data);
                    break;
                  case "audio":
                    console.log("[GROQ_CHAT_CLIENT] Processing audio chunk");
                    await queueAudioChunk(data.content);
                    break;
                  case "search_results":
                    console.log("[GROQ_CHAT_CLIENT] Processing search results");
                    fullContent += data.content.text;
                    onChunk(fullContent);
                    
                    if (data.content.sources?.length > 0) {
                      setCurrentSources(data.content.sources);
                    }
                    break;
                  case "tool_call":
                    if (data.tool === "search") {
                      // Clear any existing timer
                      if (searchTimerRef.current) {
                        clearTimeout(searchTimerRef.current);
                      }
                      setIsSearching(true);
                      // Set new timer to hide the indicator after 10 seconds
                      searchTimerRef.current = setTimeout(() => {
                        setIsSearching(false);
                      }, 10000);
                    }
                    break;
                  case "done":
                    console.log("[GROQ_CHAT_CLIENT] Received done signal");
                    return;
                  case "error":
                    console.error("[GROQ_CHAT_CLIENT] Received error from server:", data.content);
                    throw new Error(data.content);
                  default:
                    console.warn("[GROQ_CHAT_CLIENT] Unknown chunk type:", data.type);
                }
              } catch (error: any) {
                console.error("[GROQ_CHAT_CLIENT] Error processing chunk:", {
                  line,
                  error: error.message,
                  stack: error.stack
                });
              }
            }
          } catch (error: any) {
            console.error("[GROQ_CHAT_CLIENT] Error processing stream chunk:", {
              error: error.message,
              stack: error.stack
            });
          }
        }
      } catch (error: any) {
        console.error("[GROQ_CHAT_CLIENT] Error reading stream:", {
          error: error.message,
          stack: error.stack
        });
        throw error;
      } finally {
        console.log("[GROQ_CHAT_CLIENT] Releasing reader lock");
        reader.releaseLock();
      }
    } catch (error: any) {
      console.error("[GROQ_CHAT_CLIENT] Fatal stream error:", {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    console.log("[GROQ_CHAT_CLIENT] Submitting message:", userMessage);
    setInput("");
    
    try {
      console.log("[GROQ_CHAT_CLIENT] Cleaning up existing audio");
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current = null;
        } catch (error: any) {
          console.error("[GROQ_CHAT_CLIENT] Error cleaning up audio:", {
            error: error.message,
            stack: error.stack
          });
        }
      }

      audioQueue.current.forEach(audio => {
        try {
          audio.pause();
          URL.revokeObjectURL(audio.src);
        } catch (error: any) {
          console.error("[GROQ_CHAT_CLIENT] Error cleaning up queued audio:", {
            error: error.message,
            stack: error.stack
          });
        }
      });

      audioQueue.current = [];
      isProcessingAudio.current = false;
      setIsPlaying(false);
      
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      setIsLoading(true);

      console.log("[GROQ_CHAT_CLIENT] Sending request to API");
      const response = await fetch("/api/groq-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        console.error("[GROQ_CHAT_CLIENT] API request failed:", {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(response.statusText);
      }

      console.log("[GROQ_CHAT_CLIENT] Processing stream response");
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

    } catch (error: any) {
      console.error("[GROQ_CHAT_CLIENT] Error in form submission:", {
        error: error.message,
        stack: error.stack
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I apologize, but I encountered an error: " + error.message,
        },
      ]);
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
                  <>
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
                    {index === messages.length - 1 && currentSources.length > 0 && (
                      <SourcesDisplay sources={currentSources} />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <AnimatePresence>
            {isSearching && <SearchingIndicator />}
          </AnimatePresence>
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
      <div className="fixed right-0 top-0 bottom-0 w-1/2 flex flex-col
                    border-l border-violet-500/20 shadow-lg
                    bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5
                    backdrop-blur-sm rounded-none p-6">
        {currentGraph && (
          <div className="flex flex-col h-full">
            <div className="mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent mb-2">
                Portfolio Performance
              </h2>
              <div className="flex gap-4">
                {currentGraph.content?.datasets?.map((dataset, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: dataset.borderColor }}
                    />
                    <span className="text-sm text-gray-600">
                      {dataset.label}
                    </span>
                  </div>
                ))}
              </div>
           

              {/* Show interactive chart */}
              {currentGraph.content?.datasets?.length > 0 && (
                <div className="mt-4 bg-white rounded-lg p-4 shadow-sm" style={{ height: '400px' }}>
                  <Line
                    data={{
                      labels: currentGraph.content.labels,
                      datasets: currentGraph.content.datasets
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false
                        },
                        tooltip: {
                          mode: 'index',
                          intersect: false,
                          callbacks: {
                            label: function(context) {
                              return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
                            }
                          }
                        },
                      },
                      scales: {
                        y: {
                          grid: {
                            color: 'rgba(139, 92, 246, 0.1)',
                          },
                          border: {
                            color: 'rgba(139, 92, 246, 0.2)',
                          },
                          ticks: {
                            color: 'rgba(139, 92, 246, 0.8)',
                            callback: function(value) {
                              return value + '%';
                            }
                          }
                        },
                        x: {
                          grid: {
                            color: 'rgba(139, 92, 246, 0.1)',
                          },
                          border: {
                            color: 'rgba(139, 92, 246, 0.2)',
                          },
                          ticks: {
                            color: 'rgba(139, 92, 246, 0.8)',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10
                          }
                        }
                      },
                      interaction: {
                        intersect: false,
                        mode: 'index',
                      },
                    }}
                  />
                </div>
              )}

              {/* Show metrics */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500">Strategy Performance</h3>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {currentGraph.content?.datasets?.[0]?.data?.[currentGraph.content.datasets[0].data.length - 1]?.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500">Benchmark Performance</h3>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {currentGraph.content?.datasets?.[1]?.data?.[currentGraph.content.datasets[1].data.length - 1]?.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500">Relative Performance</h3>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {((currentGraph.content?.datasets?.[0]?.data?.[currentGraph.content.datasets[0].data.length - 1] || 0) - 
                      (currentGraph.content?.datasets?.[1]?.data?.[currentGraph.content.datasets[1].data.length - 1] || 0)).toFixed(2)}%
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-medium text-gray-500">Trading Days</h3>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {currentGraph.content?.labels?.length || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="fixed bottom-8 right-8">
        <FloatingMic onTranscription={handleTranscription} isLoading={isLoading} />
      </div>
    </>
  );
} 