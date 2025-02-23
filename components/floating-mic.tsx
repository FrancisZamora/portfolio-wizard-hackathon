'use client';

import { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

interface FloatingMicProps {
  onTranscription: (text: string) => void;
  isLoading: boolean;
  isInitial?: boolean;
}

export function FloatingMic({ onTranscription, isLoading, isInitial = false }: FloatingMicProps) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob);

        try {
          const response = await fetch('/api/speech-to-text', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Speech to text conversion failed');
          }

          const data = await response.json();
          onTranscription(data.text);
        } catch (error) {
          console.error('Error converting speech to text:', error);
        }

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const buttonSize = isInitial ? 'h-40 w-40' : 'h-24 w-24';
  const iconSize = isInitial ? 'h-16 w-16' : 'h-10 w-10';
  const glowSize = isInitial ? 'inset-[-8px]' : 'inset-[-4px]';
  
  return (
    <div className={isInitial ? 'relative' : 'fixed bottom-8 right-8'}>
      <div className="relative">
        {/* Outer glow and gradient ring */}
        <div 
          className={`absolute ${glowSize} rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 
                     animate-spin-slow blur-sm transition-opacity duration-500 
                     ${isRecording ? 'opacity-100' : 'opacity-40'}`} 
        />
        
        {/* Main gradient background */}
        <div 
          className={`absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 via-pink-500 to-orange-500 
                     animate-spin-slow transition-opacity duration-500 
                     ${isRecording ? 'opacity-100' : 'opacity-70'}`} 
        />
        
        {/* Recording animation */}
        {isRecording && (
          <div className="absolute inset-[-8px] -z-10">
            <div className="absolute inset-0 animate-ping rounded-full bg-green-400/20" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500/40 to-emerald-500/40" />
          </div>
        )}

        {/* Center button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isLoading}
          className={`relative ${buttonSize} rounded-full transition-all duration-500 ${
            isRecording 
              ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700' 
              : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600'
          }`}
        >
          <div className="absolute inset-[2px] rounded-full bg-black/20 backdrop-blur-sm" />
          <div className="relative flex items-center justify-center">
            {isRecording ? (
              <Square className={`${iconSize} text-white drop-shadow-lg`} />
            ) : (
              <Mic className={`${iconSize} text-white drop-shadow-lg`} />
            )}
          </div>
        </button>
      </div>
      
      {isInitial && !isRecording && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-8 text-center">
          <p className="text-xl font-medium text-primary/80"></p>
        </div>
      )}
    </div>
  );
} 