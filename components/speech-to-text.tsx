'use client';

import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from 'lucide-react';

interface SpeechToTextProps {
  onTranscription: (text: string) => void;
  isLoading: boolean;
}

export function SpeechToText({ onTranscription, isLoading }: SpeechToTextProps) {
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

  return (
    <Button
      variant="outline"
      size="icon"
      disabled={isLoading}
      onClick={isRecording ? stopRecording : startRecording}
      className={isRecording ? 'bg-red-500 hover:bg-red-600' : ''}
    >
      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
} 