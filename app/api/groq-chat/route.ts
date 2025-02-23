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
    console.log("[GROQ_CHAT] Starting request processing");
    
    const body = await req.json();
    const { messages } = body;
    console.log("[GROQ_CHAT] Received messages:", JSON.stringify(messages, null, 2));

    if (!messages) {
      console.log("[GROQ_CHAT] No messages provided");
      return new NextResponse("Messages are required", { status: 400 });
    }

    console.log("[GROQ_CHAT] Creating completion with model parameters");
    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 1000,
      stream: true,
      top_p: 1.0,
    }).catch(error => {
      console.error("[GROQ_CHAT] Groq API error:", {
        message: error.message,
        status: error.status,
        response: error.response,
        stack: error.stack
      });
      throw error;
    });

    console.log("[GROQ_CHAT] Creating streaming response");
    const stream = new ReadableStream({
      async start(controller) {
        let lastAudioTime = Date.now();
        const MIN_AUDIO_INTERVAL = 50;
        let audioBuffer = "";
        let currentWord = "";
        let audioProcessing = Promise.resolve();

        const processTextChunk = (content: string) => {
          try {
            const textChunk = JSON.stringify({ 
              type: "chunk", 
              content: content 
            }) + "\n";
            controller.enqueue(new TextEncoder().encode(textChunk));
            console.log("[GROQ_CHAT] Processed text chunk:", content);
          } catch (error: any) {
            console.error("[GROQ_CHAT] Error processing text chunk:", {
              message: error.message,
              stack: error.stack
            });
            throw error;
          }
        };

        const processSentences = async (text: string) => {
          try {
            console.log("[GROQ_CHAT] Processing sentences:", text);
            const sentences = text.match(/[^.!?]+[.!?]+/g);
            if (!sentences) return text;

            for (const sentence of sentences) {
              try {
                console.log("[GROQ_CHAT] Generating audio for sentence:", sentence.trim());
                const audioData = await textToSpeech(sentence.trim());
                
                const timeSinceLastAudio = Date.now() - lastAudioTime;
                if (timeSinceLastAudio < MIN_AUDIO_INTERVAL) {
                  await new Promise(resolve => setTimeout(resolve, MIN_AUDIO_INTERVAL - timeSinceLastAudio));
                }
                
                const chunk = JSON.stringify({
                  type: "audio",
                  content: Buffer.from(audioData).toString('base64')
                }) + "\n";
                
                controller.enqueue(new TextEncoder().encode(chunk));
                lastAudioTime = Date.now();
                console.log("[GROQ_CHAT] Successfully processed audio for sentence");
              } catch (error: any) {
                console.error("[GROQ_CHAT] Error processing sentence audio:", {
                  sentence: sentence.trim(),
                  message: error.message,
                  stack: error.stack
                });
              }
            }

            return text.replace(/[^.!?]+[.!?]+/g, '').trim();
          } catch (error: any) {
            console.error("[GROQ_CHAT] Error in sentence processing:", {
              message: error.message,
              stack: error.stack
            });
            throw error;
          }
        };


        const processAudioAsync = (text: string) => {
          audioProcessing = audioProcessing.then(async () => {
            try {
              if (/[.!?]/.test(text)) {
                console.log("[GROQ_CHAT] Processing complete sentence in audio buffer");
                audioBuffer = await processSentences(audioBuffer);
              }
              else if (audioBuffer.length > 200) {
                console.log("[GROQ_CHAT] Processing audio buffer due to length:", audioBuffer.length);
                audioBuffer = await processSentences(audioBuffer + ".");
              }
            } catch (error: any) {
              console.error("[GROQ_CHAT] Error in audio processing:", {
                text: text,
                message: error.message,
                stack: error.stack
              });
            }
          }).catch((error: any) => {
            console.error("[GROQ_CHAT] Fatal audio processing error:", {
              message: error.message,
              stack: error.stack
            });
          });
        };

        try {
          console.log("[GROQ_CHAT] Starting completion stream processing");
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (!content) {
              console.log("[GROQ_CHAT] Empty content chunk received");
              continue;
            }

            console.log("[GROQ_CHAT] Processing content chunk:", content);
            audioBuffer += content;
            processAudioAsync(audioBuffer);

            for (let i = 0; i < content.length; i++) {
              const char = content[i];
              if (char === ' ' || char === '\n') {
                if (currentWord) {
                  processTextChunk(currentWord + char);
                  currentWord = "";
                } else {
                  processTextChunk(char);
                }
              } else {
                currentWord += char;
              }
            }
          }

          if (currentWord) {
            console.log("[GROQ_CHAT] Processing final word:", currentWord);
            processTextChunk(currentWord);

          }

          console.log("[GROQ_CHAT] Waiting for audio processing to complete");
          await audioProcessing;

          if (audioBuffer.trim()) {
            console.log("[GROQ_CHAT] Processing remaining audio buffer");
            await processSentences(audioBuffer + ".");
          }

          console.log("[GROQ_CHAT] Stream processing completed successfully");
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: "done" }) + "\n"
            )
          );
        } catch (error: any) {
          console.error("[GROQ_CHAT] Stream processing error:", {
            message: error.message,
            stack: error.stack,
            phase: "stream_processing"
          });
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ 
                type: "error", 
                content: "Stream processing error: " + error.message
              }) + "\n"
            )
          );
        } finally {
          console.log("[GROQ_CHAT] Closing stream controller");
          controller.close();
        }
      }
    });

    console.log("[GROQ_CHAT] Returning stream response");
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("[GROQ_CHAT] Fatal API error:", {
      message: error.message,
      stack: error.stack,
      phase: "api_handler"
    });
    return new NextResponse("Internal Error: " + error.message, { status: 500 });
  }
}