import { search } from './search';

interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export const searchTool: Tool = {
  type: "function",
  function: {
    name: "search",
    description: "Search for information using Exa search API and return summarized results. Use this for finding current information, news, and facts.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant information"
        }
      },
      required: ["query"]
    }
  }
};

export async function executeSearch(args: { query: string }) {
  console.log("[SEARCH_TOOL] Executing search with query:", args.query);
  try {
    const summary = await search(args.query);
    console.log("[SEARCH_TOOL] Got search results:", summary);
    
    // Extract URLs and titles from markdown links
    const sources: Array<{ title: string; url: string }> = [];
    const textWithoutUrls = summary.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, title, url) => {
      sources.push({ title, url });
      return title;
    });
    
    // Return in the format expected by the streaming system
    const response = {
      type: "search_results",
      content: {
        text: textWithoutUrls,  // Clean text for display and audio
        sources: sources        // Array of sources for the book widget
      }
    };
    
    console.log("[SEARCH_TOOL] Sending response:", JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error("[SEARCH_TOOL] Search execution error:", error);
    throw error;
  }
} 