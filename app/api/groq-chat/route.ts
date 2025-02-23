import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
});

// Add retry utility function
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoffRate = 2
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * backoffRate, backoffRate);
    }
    throw error;
  }
}

// Utility function to convert text to speech and return audio data
async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Rachel voice
  
  return retryWithBackoff(async () => {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          }
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    return await response.arrayBuffer();
  }, 3, 1000);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 1000,
      stream: true
    });

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let currentChunk = "";
        let lastAudioTime = Date.now();
        const MIN_AUDIO_INTERVAL = 50; // Minimum 50ms between audio chunks
        let buffer = ""; // Add buffer for incomplete chunks

        const processSentences = async (text: string) => {
          const sentences = text.match(/[^.!?]+[.!?]+/g);
          if (!sentences) return text;

          for (const sentence of sentences) {
            try {
              const audioData = await textToSpeech(sentence.trim());
              
              // Ensure minimum interval between audio chunks
              const timeSinceLastAudio = Date.now() - lastAudioTime;
              if (timeSinceLastAudio < MIN_AUDIO_INTERVAL) {
                await new Promise(resolve => setTimeout(resolve, MIN_AUDIO_INTERVAL - timeSinceLastAudio));
              }
              
              // Send the audio chunk
              const chunk = JSON.stringify({
                type: "audio",
                content: Buffer.from(audioData).toString('base64')
              }) + "\n";
              
              controller.enqueue(new TextEncoder().encode(chunk));
              lastAudioTime = Date.now();
            } catch (error) {
              console.error("Error generating audio for sentence:", error);
              // Don't throw here, continue with next sentence
            }
          }

          // Return any remaining text that didn't end with punctuation
          return text.replace(/[^.!?]+[.!?]+/g, '').trim();
        };

        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (!content) continue;

            currentChunk += content;

            // Process complete sentences when we have them
            if (/[.!?]/.test(content)) {
              currentChunk = await processSentences(currentChunk);
            }
            // Or when the chunk is getting too long
            else if (currentChunk.length > 200) {
              currentChunk = await processSentences(currentChunk + ".");
            }

            // Send the text chunk
            const textChunk = JSON.stringify({ 
              type: "chunk", 
              content 
            }) + "\n";
            
            controller.enqueue(new TextEncoder().encode(textChunk));
          }

          // Process any remaining text
          if (currentChunk.trim()) {
            await processSentences(currentChunk + ".");
          }

          // Send end marker
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: "done" }) + "\n"
            )
          );
        } catch (error) {
          console.error("Stream processing error:", error);
          // Send error message to client
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ 
                type: "error", 
                content: "Stream processing error" 
              }) + "\n"
            )
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.log("[GROQ_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}