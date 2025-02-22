import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createReadStream } from 'fs';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as Blob;

    if (!audioFile) {
      return new NextResponse("Audio file is required", { status: 400 });
    }

    // Create a temporary file path
    const tempFilePath = join(tmpdir(), `audio-${Date.now()}.webm`);
    
    // Write the blob to a temporary file
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(tempFilePath, buffer);

    // Create a readable stream from the file
    const fileStream = createReadStream(tempFilePath);

    // Transcribe using Groq's Whisper model
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "json"
    });

    // Clean up the temporary file
    await writeFile(tempFilePath, '').catch(console.error);

    console.log("[TRANSCRIPTION]", transcription);

    return NextResponse.json({ text: transcription.text });
  } catch (error) {
    console.error("[SPEECH_TO_TEXT_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 