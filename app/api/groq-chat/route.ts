import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
});

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
        const chunkSize = 200; // Characters per chunk

        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (!content) continue;

            currentChunk += content;

            // When we have enough characters or it's the end of a sentence
            if (currentChunk.length >= chunkSize || 
                (content.includes(".") && currentChunk.length > 50)) {
              
              // Send the chunk with proper JSON formatting
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ type: "chunk", content: currentChunk.trim() }) + "\n"
                )
              );
              currentChunk = "";
            }
          }

          // Send any remaining text
          if (currentChunk.trim()) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ type: "chunk", content: currentChunk.trim() }) + "\n"
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
          controller.error(error);
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