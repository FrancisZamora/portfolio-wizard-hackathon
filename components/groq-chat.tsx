'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Volume2, VolumeX } from 'lucide-react';
import { FloatingMic } from "@/components/floating-mic";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function GroqChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastMessageRef = useRef<Message | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // Effect to handle automatic playback of new messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage;
      // Don't automatically play the message - it will be handled by the streaming logic
    }
  }, [messages]);

  const playNextAudioChunk = async () => {
    if (audioQueueRef.current.length === 0 || isPlayingRef.current) return;
    
    isPlayingRef.current = true;
    // Take multiple sentences up to a reasonable length
    let textToSpeak = "";
    const maxChunks = Math.min(3, audioQueueRef.current.length); // Process up to 3 sentences at once
    for (let i = 0; i < maxChunks; i++) {
      const nextChunk = audioQueueRef.current[0];
      if (textToSpeak.length + nextChunk.length > 200) break; // Reduced from 250 to 200
      textToSpeak += (textToSpeak ? " " : "") + audioQueueRef.current.shift();
    }
    
    try {
      // Cleanup previous audio if exists
      if (audioRef.current) {
        const oldAudio = audioRef.current;
        oldAudio.pause();
        oldAudio.src = '';
        oldAudio.load();
        audioRef.current = null;
      }

      const response = await fetch("/api/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate speech");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Set up event listeners before setting audioRef.current
      audio.onplay = () => {
        setIsPlaying(true);
        setCurrentPlayingIndex(messages.length - 1);
      };

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (audioRef.current === audio) {
          audioRef.current = null;
          setIsPlaying(false);
          setCurrentPlayingIndex(null);
          isPlayingRef.current = false;
          
          // Small delay before playing next chunk to prevent overlapping
          if (audioQueueRef.current.length > 0) {
            setTimeout(() => playNextAudioChunk(), 50);
          }
        }
      };

      audio.onerror = () => {
        console.error("Audio playback error");
        URL.revokeObjectURL(audioUrl);
        if (audioRef.current === audio) {
          audioRef.current = null;
          setIsPlaying(false);
          setCurrentPlayingIndex(null);
          isPlayingRef.current = false;
        }
        audioQueueRef.current = [];
      };

      // Only set the ref after all event listeners are set up
      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error("Error playing audio:", error);
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentPlayingIndex(null);
      audioQueueRef.current = [];
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Cleanup any existing audio
    if (audioRef.current) {
      const oldAudio = audioRef.current;
      oldAudio.pause();
      oldAudio.src = '';
      oldAudio.load();
      audioRef.current = null;
    }
    audioQueueRef.current = [];
    setIsPlaying(false);
    setCurrentPlayingIndex(null);
    isPlayingRef.current = false;
    
    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    
    setIsLoading(true);
    try {
      const assistantMessageIndex = messages.length + 1;
      let fullResponse = "";
      let currentSentence = "";
      let sentenceBuffer: string[] = [];
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const response = await fetch("/api/groq-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) throw new Error(response.statusText);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      const processSentenceBuffer = () => {
        if (sentenceBuffer.length > 0) {
          const text = sentenceBuffer.join('. ').replace(/\.\s*\./g, '.').trim();
          if (text) {
            audioQueueRef.current.push(text);
            if (!isPlayingRef.current && !audioRef.current) {
              playNextAudioChunk();
            }
          }
          sentenceBuffer = [];
        }
      };

      // Process the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (currentSentence.trim()) {
            sentenceBuffer.push(currentSentence.trim());
          }
          processSentenceBuffer();
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            
            try {
              const { content } = JSON.parse(data);
              if (content) {
                currentSentence += content;
                fullResponse += content;
                
                // Update the message immediately
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[assistantMessageIndex] = {
                    role: "assistant",
                    content: fullResponse,
                  };
                  return newMessages;
                });

                // Check for complete sentences
                let sentenceMatch;
                const sentenceRegex = /[^.!?]+[.!?]+/g;
                
                while ((sentenceMatch = sentenceRegex.exec(currentSentence)) !== null) {
                  const completeSentence = sentenceMatch[0];
                  const endIndex = sentenceMatch.index + completeSentence.length;
                  
                  // Add to sentence buffer
                  sentenceBuffer.push(completeSentence.trim());
                  
                  // Process buffer if we have enough sentences
                  if (sentenceBuffer.length >= 2) {
                    processSentenceBuffer();
                  }
                  
                  // Keep any remaining text for the next sentence
                  currentSentence = currentSentence.slice(endIndex);
                }
              }
            } catch (e) {
              console.error('Error parsing JSON:', e, 'Data:', data);
            }
          }
        }
      }

      // Final message update
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[assistantMessageIndex] = {
          role: "assistant",
          content: fullResponse,
        };
        return newMessages;
      });

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
    
    // Clear audio queue and stop any playing audio
    audioQueueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentPlayingIndex(null);
    isPlayingRef.current = false;

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
      const assistantMessage: Message = { role: 'assistant', content: data.content };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      // Handle error appropriately
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAudio = (text: string, index: number) => {
    if (audioRef.current) {
      if (isPlaying && currentPlayingIndex === index) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsPlaying(false);
        setCurrentPlayingIndex(null);
        isPlayingRef.current = false;
        audioQueueRef.current = [];
      } else {
        // Clear existing queue and start new playback
        audioQueueRef.current = [text];
        playNextAudioChunk();
      }
    } else {
      // Start new playback
      audioQueueRef.current = [text];
      playNextAudioChunk();
    }
  };

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
      <FloatingMic onTranscription={handleTranscription} isLoading={isLoading} />
    </>
  );
} 