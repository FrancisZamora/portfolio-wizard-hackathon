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

    // Create a new TransformStream for streaming
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Get streaming response from Groq
    const response = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 1000,
      stream: true
    });

    // Process the stream
    (async () => {
      try {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            // Send each chunk as a JSON object
            const jsonChunk = JSON.stringify({ content });
            await writer.write(encoder.encode(`data: ${jsonChunk}\n\n`));
          }
        }
        // Send a done message
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      } catch (error) {
        console.error("Streaming error:", error);
        await writer.abort(error);
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("[GROQ_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}