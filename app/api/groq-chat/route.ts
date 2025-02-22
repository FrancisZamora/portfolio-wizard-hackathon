import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getUser } from "@/lib/db/queries";

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

    const response = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
    });

    return NextResponse.json(response.choices[0].message);
  } catch (error) {
    console.log("[GROQ_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 