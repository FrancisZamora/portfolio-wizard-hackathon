import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import fetch from "node-fetch";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
});

// Define the search tool
const searchTool = {
  type: "function" as const,
  function: {
    name: "search",
    description: "Search the web for real-time information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up"
        }
      },
      required: ["query"]
    }
  }
};

async function performBingSearch(query: string) {
  try {
    const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY!
      }
    });
    
    const data = await response.json();
    
    // Extract and format relevant information
    const results = data.webPages?.value?.slice(0, 3).map((result: any) => ({
      title: result.name,
      snippet: result.snippet,
      url: result.url
    })) || [];

    return JSON.stringify(results);
  } catch (error) {
    console.error("Bing search error:", error);
    return JSON.stringify([]);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    // First call to determine if search is needed
    const response = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 1000,
      tools: [searchTool],
      tool_choice: "auto"
    });

    const initialResponse = response.choices[0].message;
    
    // Check if tool call is requested
    if (initialResponse.tool_calls) {
      const toolCall = initialResponse.tool_calls[0];
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      // Perform the search
      const searchResults = await performBingSearch(functionArgs.query);
      
      // Add the tool response to messages
      messages.push(initialResponse);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: searchResults
      });

      // Get final response with search results
      const finalResponse = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 1000
      });

      return NextResponse.json(finalResponse.choices[0].message);
    }

    // If no tool call needed, return the initial response
    return NextResponse.json(initialResponse);
  } catch (error) {
    console.log("[GROQ_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 