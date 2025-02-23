'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Volume2, VolumeX } from 'lucide-react';
import { FloatingMic } from "@/components/floating-mic";
import { motion, AnimatePresence } from "framer-motion";

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
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

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

      const data = await response.json();
      const assistantMessage = { role: "assistant" as const, content: data.content };
      
      setMessages(prev => [...prev, assistantMessage]);
      playNextAudioChunk(data.content);

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

  const playNextAudioChunk = async (text: string) => {
    if (!text.trim()) return;
    
    try {
      // Cleanup previous audio if exists
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
        audioRef.current = null;
      }

      const response = await fetch("/api/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate speech: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setIsPlaying(false);
        setCurrentPlayingIndex(null);
      };

      audioRef.current = audio;
      setIsPlaying(true);
      await audio.play();
    } catch (error) {
      console.error("[AUDIO] Error:", error);
      setIsPlaying(false);
      audioRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Cleanup any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
      audioRef.current = null;
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

      const data = await response.json();
      const assistantMessage = { role: "assistant" as const, content: data.content };
      
      setMessages((prev) => [...prev, assistantMessage]);
      playNextAudioChunk(data.content);

    } catch (error) {
      console.error("Error:", error);
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

      const data = await response.json();
      const assistantMessage = { role: "assistant" as const, content: data.content };
      
      setMessages(prev => [...prev, assistantMessage]);
      playNextAudioChunk(data.content);

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

  const toggleAudio = (text: string, index: number) => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentPlayingIndex(null);
    } else {
      setCurrentPlayingIndex(index);
      playNextAudioChunk(text);
    }
  };

  if (isInitialState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden"
           style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Starter prompts container */}
        <div className="fixed inset-0 pointer-events-none" style={{ overflow: 'hidden' }}>
          <div className="relative w-screen h-screen" style={{ overflow: 'hidden' }}>
            {STARTER_PROMPTS.map((prompt, index) => {
              const centerX = windowSize.width / 2;
              const centerY = windowSize.height / 2;
              
              // Calculate safe spacing based on screen dimensions
              const minDimension = Math.min(windowSize.width, windowSize.height);
              const safeArea = minDimension * 0.85;
              
              // Calculate ring radii with better spacing
              const innerRadius = safeArea * 0.28; // Slightly smaller inner radius
              const outerRadius = safeArea * 0.48; // Slightly larger outer radius
              
              // Calculate number of items in each ring
              const innerRingCount = 5; // First 5 prompts
              const outerRingCount = STARTER_PROMPTS.length - innerRingCount;
              
              let x, y;
              const isOuterRing = index >= innerRingCount;

              if (isOuterRing) {
                // Outer ring calculations - Perfect circle
                const outerIndex = index - innerRingCount;
                const angle = (outerIndex * (2 * Math.PI / outerRingCount));
                x = centerX + Math.cos(angle) * outerRadius;
                y = centerY + Math.sin(angle) * outerRadius;
              } else {
                // Inner ring calculations - Perfect pentagon
                const angle = (index * (2 * Math.PI / innerRingCount));
                x = centerX + Math.cos(angle) * innerRadius;
                y = centerY + Math.sin(angle) * innerRadius;
              }

              // No random offset for perfect spacing
              const offsetX = 0;
              const offsetY = 0;
              
              // Adjust bubble sizes for better spacing
              const bubbleWidth = isOuterRing ? 140 : 150; // Increased outer ring size to 140px
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
                    width: isOuterRing ? 'min(140px, 10.5vw)' : 'min(150px, 11vw)', // Increased outer ring size
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
            top: '50%',
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
      <Card className="w-full max-w-2xl mx-auto p-4 h-[600px] flex flex-col">
        <ScrollArea className="flex-1 p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-muted'
              } max-w-[80%]`}
            >
              {message.content}
              {message.role === 'assistant' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2"
                  onClick={() => toggleAudio(message.content, index)}
                >
                  {isPlaying && currentPlayingIndex === index ? 
                    <VolumeX className="h-4 w-4" /> : 
                    <Volume2 className="h-4 w-4" />
                  }
                </Button>
              )}
            </div>
          ))}
        </ScrollArea>
        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send'}
          </Button>
        </form>
      </Card>
      <div className="fixed bottom-8 right-8">
        <FloatingMic onTranscription={handleTranscription} isLoading={isLoading} />
      </div>
    </>
  );
} 