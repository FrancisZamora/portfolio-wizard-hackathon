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
      temperature: 0.1,
      max_tokens: 1000,
      stream: true,
      top_p: 1.0,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let lastAudioTime = Date.now();
        const MIN_AUDIO_INTERVAL = 50; // Minimum 50ms between audio chunks
        let audioBuffer = ""; // Separate buffer for audio processing
        let currentWord = ""; // Buffer for current word

        // Create separate promise chain for audio processing
        let audioProcessing = Promise.resolve();

        const processTextChunk = (content: string) => {
          try {
            const textChunk = JSON.stringify({ 
              type: "chunk", 
              content: content 
            }) + "\n";
            controller.enqueue(new TextEncoder().encode(textChunk));
          } catch (error) {
            console.error("Error processing text chunk:", error);
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ 
                  type: "error", 
                  content: "Text chunk processing error" 
                }) + "\n"
              )
            );
          }
        };

        const processSentences = async (text: string) => {
          try {
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
                console.error("Error processing individual sentence:", error);
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({ 
                      type: "error", 
                      content: "Audio generation error for sentence" 
                    }) + "\n"
                  )
                );
                // Continue with next sentence
              }
            }

            // Return any remaining text that didn't end with punctuation
            return text.replace(/[^.!?]+[.!?]+/g, '').trim();
          } catch (error) {
            console.error("Error in sentence processing:", error);
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ 
                  type: "error", 
                  content: "Sentence processing error" 
                }) + "\n"
              )
            );
            return text;
          }
        };

        const processAudioAsync = (text: string) => {
          audioProcessing = audioProcessing.then(async () => {
            try {
              if (/[.!?]/.test(text)) {
                audioBuffer = await processSentences(audioBuffer);
              }
              else if (audioBuffer.length > 200) {
                audioBuffer = await processSentences(audioBuffer + ".");
              }
            } catch (error) {
              console.error("Error in audio processing:", error);
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ 
                    type: "error", 
                    content: "Audio processing error" 
                  }) + "\n"
                )
              );
            }
          }).catch(error => {
            console.error("Fatal audio processing error:", error);
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ 
                  type: "error", 
                  content: "Fatal audio processing error" 
                }) + "\n"
              )
            );
          });
        };

        try {
          for await (const chunk of completion) {
            try {
              const content = chunk.choices[0]?.delta?.content || "";
              if (!content) continue;

              // Add to audio buffer and process audio asynchronously
              audioBuffer += content;
              processAudioAsync(audioBuffer);

              // Process text instantly without waiting for audio
              try {
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
              } catch (error) {
                console.error("Error processing text content:", error);
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({ 
                      type: "error", 
                      content: "Text content processing error" 
                    }) + "\n"
                  )
                );
              }
            } catch (error) {
              console.error("Error processing completion chunk:", error);
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ 
                    type: "error", 
                    content: "Completion chunk processing error" 
                  }) + "\n"
                )
              );
            }
          }

          // Process any remaining word immediately
          if (currentWord) {
            processTextChunk(currentWord);
          }

          try {
            // Wait for audio processing to complete before sending done marker
            await audioProcessing;

            // Process any remaining audio buffer
            if (audioBuffer.trim()) {
              await processSentences(audioBuffer + ".");
            }
          } catch (error) {
            console.error("Error in final audio processing:", error);
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ 
                  type: "error", 
                  content: "Final audio processing error" 
                }) + "\n"
              )
            );
          }

          // Send end marker
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: "done" }) + "\n"
            )
          );
        } catch (error) {
          console.error("Fatal stream processing error:", error);
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ 
                type: "error", 
                content: "Fatal stream processing error" 
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