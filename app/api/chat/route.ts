import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { generateText } from "ai";
import {
    calculateWordFrequency,
    generateStats,
} from "@/lib/tools/custom-tools";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages } = body;

        if (!messages) {
            return new NextResponse("Messages are required", { status: 400 });
        }

        // Add system message to guide tool usage
        const systemMessage = {
            role: "system",
            content: `You are a helpful AI assistant. You have access to two specific tools:
            1. calculateWordFrequency - Use this when asked to analyze word frequency in text
            2. generateStats - Use this when asked to analyze numerical statistics
            
            Only use these tools when explicitly asked for word frequency or numerical statistics. 
            For all other queries, respond normally without using any tools.`,
        };

        // First, get the Groq response with system message
        const response = await groq.chat.completions.create({
            messages: [systemMessage, ...messages],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 2048,
        });

        const responseContent = response.choices[0].message.content;

        // Only process with tools if the message contains specific triggers
        const needsWordFrequency =
            responseContent.toLowerCase().includes("word frequency") ||
            messages[messages.length - 1].content
                .toLowerCase()
                .includes("word frequency");
        const needsStats =
            responseContent.toLowerCase().includes("statistics") ||
            messages[messages.length - 1].content
                .toLowerCase()
                .includes("statistics");

        if (needsWordFrequency || needsStats) {
            const result = await generateText({
                messages: [
                    ...messages,
                    { role: "assistant", content: responseContent },
                ],
                tools: [calculateWordFrequency, generateStats],
                tool_choice: "auto",
                temperature: 0.7,
                process: async ({ messages, functions }) => {
                    for (const func of functions) {
                        if (
                            func.name === "calculateWordFrequency" &&
                            needsWordFrequency
                        ) {
                            const result = await calculateWordFrequency.handler(
                                func.arguments
                            );
                            messages.push({
                                role: "function",
                                name: "calculateWordFrequency",
                                content: JSON.stringify(result),
                            });
                        }
                        if (func.name === "generateStats" && needsStats) {
                            const result = await generateStats.handler(
                                func.arguments
                            );
                            messages.push({
                                role: "function",
                                name: "generateStats",
                                content: JSON.stringify(result),
                            });
                        }
                    }
                    return messages;
                },
            });

            return NextResponse.json({
                ...response.choices[0].message,
                toolResults: result,
            });
        }

        // Return regular response if no tools needed
        return NextResponse.json(response.choices[0].message);
    } catch (error) {
        console.log("[GROQ_ERROR]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
