import { NextResponse } from "next/server";

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return new NextResponse("Text is required", { status: 400 });
    }

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
      console.error("ElevenLabs API error:", error);
      throw new Error("Failed to generate speech");
    }

    // Stream the audio response
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    console.error("[TEXT_TO_SPEECH_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 