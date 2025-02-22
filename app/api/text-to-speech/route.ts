import { NextResponse } from "next/server";

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    console.log("[TEXT-TO-SPEECH] Received request with text length:", text?.length);
    console.log("[TEXT-TO-SPEECH] Text content:", text);

    if (!text) {
      console.error("[TEXT-TO-SPEECH] No text provided");
      return new NextResponse("Text is required", { status: 400 });
    }

    if (typeof text !== 'string') {
      console.error("[TEXT-TO-SPEECH] Invalid text type:", typeof text);
      return new NextResponse("Text must be a string", { status: 400 });
    }

    if (text.length > 5000) {
      console.error("[TEXT-TO-SPEECH] Text too long:", text.length);
      return new NextResponse("Text too long (max 5000 characters)", { status: 400 });
    }

    console.log("[TEXT-TO-SPEECH] Calling ElevenLabs API...");
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
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
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("[TEXT-TO-SPEECH] ElevenLabs API error:", {
        status: response.status,
        statusText: response.statusText,
        error
      });
      return new NextResponse(
        JSON.stringify({ error: "Failed to generate speech", details: error }), 
        { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if we actually received audio data
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('audio/')) {
      console.error("[TEXT-TO-SPEECH] Invalid content type received:", contentType);
      return new NextResponse(
        JSON.stringify({ error: "Invalid response from speech service" }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Stream the audio response with proper headers
    console.log("[TEXT-TO-SPEECH] Successfully generated audio, streaming response");
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked'
      },
    });
  } catch (error) {
    console.error("[TEXT-TO-SPEECH] Internal error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal server error", details: error }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 