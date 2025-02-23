import { NextResponse } from "next/server";

const VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Rachel voice

export async function POST(req: Request) {
  try {
    console.log("[DEBUG] Starting text-to-speech request");
    const { text } = await req.json();
    console.log("[DEBUG] Received text length:", text?.length);

    if (!text) {
      console.log("[DEBUG] No text provided");
      return new NextResponse("Text is required", { status: 400 });
    }

    if (typeof text !== 'string') {
      console.log("[DEBUG] Invalid text type:", typeof text);
      return new NextResponse("Text must be a string", { status: 400 });
    }

    if (text.length > 5000) {
      console.log("[DEBUG] Text too long:", text.length);
      return new NextResponse("Text too long (max 5000 characters)", { status: 400 });
    }

    console.log("[DEBUG] Calling ElevenLabs API");
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
      console.error("[DEBUG] ElevenLabs API error:", {
        status: response.status,
        statusText: response.statusText,
        error: await response.text()
      });
      return new NextResponse("Failed to generate speech", { status: response.status });
    }

    console.log("[DEBUG] Got response from ElevenLabs");
    const audioData = await response.arrayBuffer();
    console.log("[DEBUG] Converted to array buffer, size:", audioData.byteLength);
    
    return new Response(audioData, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.byteLength.toString()
      }
    });

  } catch (error) {
    console.error("[DEBUG] Internal error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
} 