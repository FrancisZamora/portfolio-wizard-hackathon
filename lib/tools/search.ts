import { z } from "zod";
import { Groq } from "groq-sdk";

interface ExaResult {
  title?: string;
  url: string;
  summary?: string;
  text?: string;
}

interface ExaContentsResult {
  results: Array<{
    url: string;
    text?: string;
    summary?: string;
    title?: string;
  }>;
}

interface FormattedResult {
  title: string;
  url: string;
  summary?: string;
  text: string;
  detailedSummary?: string;
}

async function getContents(urls: string[]): Promise<ExaContentsResult> {
  console.log("[CONTENTS_API] Fetching contents for URLs:", urls);
  
  const response = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.EXA_API_KEY}`,
    },
    body: JSON.stringify({
      urls,
      text: true,
      summary: true
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[CONTENTS_API] Error response:", {
      status: response.status,
      statusText: response.statusText,
      error: errorText
    });
    throw new Error(`Contents fetch failed: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[CONTENTS_API] Received response:", JSON.stringify(data, null, 2));
  return data;
}

async function generateSummaryWithGroq(query: string, summaries: Array<{ title: string; url: string; summary: string }>): Promise<string> {
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
  });

  const formattedSummaries = summaries.map((s, i) => 
    `Source ${i + 1}: ${s.title}\nURL: ${s.url}\nSummary: ${s.summary}\n`
  ).join('\n');

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You are a precise and informative AI that synthesizes information from multiple sources.
Your task is to:
1. Analyze the provided summaries from different sources
2. Create a concise and informative summary in EXACTLY 75 words
3. Focus on the most important and relevant information
4. Write in a clear, engaging style
5. DO NOT include any URLs or source references in the summary text

The summary should be self-contained and readable, with all URLs removed.
The sources will be displayed separately in a dedicated section.`
      },
      {
        role: "user",
        content: `Query: "${query}"\n\nHere are the summaries from multiple sources:\n\n${formattedSummaries}\n\nPlease provide a 75-word summary of this information, excluding any URLs or source references.`
      }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    max_tokens: 250,
    stream: false
  });

  return completion.choices[0]?.message?.content || "No summary available";
}

export async function search(query: string): Promise<string> {
  try {
    console.log("[SEARCH_API] Making request with query:", query);
    
    // Step 1: Get initial results from search API
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXA_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        text: true
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SEARCH_API] Error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Search failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log("[SEARCH_API] Received search results:", JSON.stringify(data, null, 2));
    
    // Step 2: Format initial results
    const results = data.results.map((result: ExaResult): FormattedResult => ({
      title: result.title || "No title",
      url: result.url,
      summary: result.summary || result.text?.slice(0, 200) + "..." || undefined,
      text: result.text || "",
    }));

    // Step 3: Get URLs from top 3 results and fetch detailed contents
    const top3Urls = results.slice(0, 3).map((result: FormattedResult): string => result.url);
    console.log("[SEARCH_API] Fetching detailed contents for top 3 URLs:", top3Urls);
    const contentsData = await getContents(top3Urls);

    // Step 4: Update results with detailed summaries from contents API
    results.forEach((result: FormattedResult, index: number): void => {
      if (index < 3 && contentsData.results[index]) {
        const contentResult = contentsData.results[index];
        result.detailedSummary = contentResult.summary;
        if (contentResult.text) {
          result.text = contentResult.text;
        }
      }
    });

    // Step 5: Prepare summaries for Groq using the detailed content
    const summariesForGroq = results.slice(0, 3)
      .map((result: FormattedResult) => ({
        title: result.title,
        url: result.url,
        summary: result.detailedSummary || result.summary || result.text.slice(0, 200) + "..."
      }))
      .filter((summary: { title: string; url: string; summary: string }) => summary.summary);

    console.log("[SEARCH_API] Preparing summaries for Groq:", JSON.stringify(summariesForGroq, null, 2));

    // Step 6: Generate and return only the AI summary
    return await generateSummaryWithGroq(query, summariesForGroq);
  } catch (error) {
    console.error('[SEARCH_API] Search error:', error);
    throw error;
  }
} 