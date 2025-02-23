import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { searchTool, executeSearch } from '@/lib/tools/groq-tools';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!
});

// Add retry utility function
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoffRate = 2
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * backoffRate, backoffRate);
    }
    throw error;
  }
}

// Function to generate graph data
function generateGraphData(type: string = 'random') {
  const labels = Array.from({ length: 10 }, (_, i) => `Point ${i + 1}`);
  let data: number[];
  
  switch (type) {
    case 'uptrend':
      data = Array.from({ length: 10 }, (_, i) => 
        40 + i * 10 + Math.random() * 10
      );
      break;
    case 'downtrend':
      data = Array.from({ length: 10 }, (_, i) => 
        140 - i * 10 + Math.random() * 10
      );
      break;
    case 'volatile':
      data = Array.from({ length: 10 }, () => 
        50 + Math.random() * 100
      );
      break;
    default:
      data = Array.from({ length: 10 }, () => 
        Math.floor(Math.random() * 100)
      );
  }

  return {
    type: "graph",
    content: {
      labels,
      datasets: [{
        label: 'Data Points',
        data,
        borderColor: 'rgb(139, 92, 246)',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4,
      }]
    }
  };
}

// Utility function to convert text to speech and return audio data
async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Rachel voice
  
  return retryWithBackoff(async () => {
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
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    return await response.arrayBuffer();
  }, 3, 1000);
}

// Define the backtest tool
const backtestTool = {
  type: "function" as const,
  function: {
    name: "runBacktest",
    description: "Run a backtest simulation on a portfolio of stocks and generate performance graphs.",
    parameters: {
      type: "object",
      properties: {
        longStocks: {
          type: "array",
          items: { type: "string" },
          description: "List of stock symbols to go long on (e.g. ['AAPL', 'GOOGL'])"
        },
        shortStocks: {
          type: "array",
          items: { type: "string" },
          description: "List of stock symbols to short (e.g. ['META', 'NFLX'])"
        },
        longWeights: {
          type: "array",
          items: { type: "number" },
          description: "Optional weights for long positions (must sum to 1)"
        },
        shortWeights: {
          type: "array",
          items: { type: "number" },
          description: "Optional weights for short positions (must sum to 1)"
        },
        benchmark: {
          type: "string",
          description: "Benchmark symbol (e.g. '^GSPC' for S&P 500)",
          default: "^GSPC"
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
          default: "2023-01-01"
        },
        endDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format",
          default: "2024-01-01"
        }
      },
      required: ["longStocks"]
    }
  }
};

// Function to execute Python script and return results
async function executeBacktest(params: any): Promise<any> {
  try {
    const { spawn } = require('child_process');
    
    // Construct command line arguments
    const args = [
      'lib/tools/backtest.py',
      '--long_stocks', ...params.longStocks,
      '--benchmark', params.benchmark || '^GSPC',
      '--start_date', params.startDate || '2023-01-01',
      '--end_date', params.endDate || '2024-01-01'
    ];

    if (params.shortStocks?.length > 0) {
      args.push('--short_stocks', ...params.shortStocks);
    }
    if (params.longWeights?.length > 0) {
      args.push('--long_weights', ...params.longWeights.map(String));
    }
    if (params.shortWeights?.length > 0) {
      args.push('--short_weights', ...params.shortWeights.map(String));
    }

    // Execute Python script
    const pythonProcess = spawn('python3', args);
    
    return new Promise((resolve, reject) => {
      let result = '';
      let error = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        error += data.toString();
      });

      pythonProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${error}`));
        } else {
          // Read the generated CSV file for numerical data
          const fs = require('fs');
          const csv = require('csv-parse/sync');
          const backtestData = fs.readFileSync('backtest.csv');
          const records = csv.parse(backtestData, { columns: true });
          
          // Convert to graph format with both numerical data and plot
          const graphData = {
            type: "graph",
            content: {
              // Numerical data for the interactive chart
              labels: records.map((_: any, i: number) => `Day ${i + 1}`),
              datasets: [
                {
                  label: 'Strategy Returns',
                  data: records.map((r: any) => r['Strategy Returns'] * 100),
                  borderColor: 'rgb(139, 92, 246)',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  fill: true,
                  tension: 0.4,
                },
                {
                  label: 'Benchmark Returns',
                  data: records.map((r: any) => r['Benchmark Returns'] * 100),
                  borderColor: 'rgb(244, 114, 182)',
                  backgroundColor: 'rgba(244, 114, 182, 0.1)',
                  fill: true,
                  tension: 0.4,
                }
              ],
              // Add the matplotlib plot as base64 image
              plotImage: result.trim()
            }
          };
          
          resolve(graphData);
        }
      });
    });
  } catch (error) {
    console.error("[BACKTEST_ERROR]", error);
    throw error;
  }
}

// Update classifier function to handle only backtest
async function classifyQuery(query: string): Promise<{ backtestScore: number, searchScore: number }> {
  try {
    console.log(`
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
CLASSIFYING QUERY: "${query}"
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
`);
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a classifier that determines if a query is requesting stock backtesting or searching for information.
Score queries from 0 to 1 for backtesting and searching.
YOU MUST RETURN EXACTLY TWO NUMBERS separated by a space, representing backtestScore and searchScore.

BACKTEST SCORING:
1.0 = Definitely requesting stock backtesting
0.0 = Not related to backtesting

SEARCH SCORING:
1.0 = Definitely requesting information search (e.g. "search for X", "find info about Y", "what's the latest news about Z")
0.0 = Not related to searching

Example responses:
"what's the latest news about Tesla" => "0.0 1.0"
"backtest AAPL and GOOGL" => "1.0 0.0"
"find information about Bitcoin price" => "0.0 1.0"
"how are you" => "0.0 0.0"

RESPOND WITH EXACTLY TWO NUMBERS WITH A SPACE BETWEEN THEM.`
        },
        {
          role: "user",
          content: query
        }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 10,
      stream: false
    });

    const rawResponse = completion.choices[0]?.message?.content?.trim() || "0 0";
    console.log(`
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
CLASSIFIER RAW RESPONSE: "${rawResponse}"
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
`);

    const [backtestScore, searchScore] = rawResponse.split(' ').map(Number);
    return { 
      backtestScore: isNaN(backtestScore) ? 0 : backtestScore, 
      searchScore: isNaN(searchScore) ? 0 : searchScore 
    };
  } catch (error) {
    console.error("[CLASSIFIER_ERROR]", error);
    return { backtestScore: 0, searchScore: 0 };
  }
}

export async function POST(req: Request) {
  try {
    console.log("[GROQ_CHAT] Starting request processing");
    
    const body = await req.json();
    const { messages } = body;
    console.log("[GROQ_CHAT] Received messages:", JSON.stringify(messages, null, 2));

    if (!messages) {
      console.log("[GROQ_CHAT] No messages provided");
      return new NextResponse("Messages are required", { status: 400 });
    }

    // Get the last message and classify it
    const lastMessage = messages[messages.length - 1];
    const { backtestScore, searchScore } = await classifyQuery(lastMessage.content);
    console.log(`
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
CLASSIFICATION SCORES:
Backtest Score: ${backtestScore}
Search Score: ${searchScore}
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
`);

    // Route to appropriate handler based on score
    const useBacktest = backtestScore > 0.9;
    const useSearch = searchScore > 0.7;
    
    console.log(`
💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩
USING TOOLS:
useBacktest: ${useBacktest}
useSearch: ${useSearch}
Threshold Change: Now using search tool for scores > 0.7
💩💩💩💩💩💩💩💩💩💩��💩��💩��💩💩💩💩💩
`);

    console.log("[GROQ_CHAT] Creating completion with model parameters");
    const completion = await groq.chat.completions.create(
      useBacktest ? {
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant specializing in stock portfolio analysis.
You can perform backtesting when users explicitly request it, but you can also handle general questions about stocks, markets, and investing.

For backtest requests (when users explicitly ask to analyze or compare stock performance):
1. ALWAYS extract stock symbols from their message (e.g., AAPL, GOOGL, TSLA)
2. ALWAYS use the runBacktest tool with these parameters:
   - longStocks: Array of stock symbols to analyze
   - startDate: Start date (default: "2023-01-01")
   - endDate: End date (default: today)
   - benchmark: Default to S&P 500 (^GSPC)

You MUST use the runBacktest tool when:
- User mentions "backtest" or "generate backtest"
- User asks to compare specific stocks (with symbols)
- User asks about performance of specific stocks
- User asks to analyze specific stocks`
          },
          ...messages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1000,
        stream: true,
        tools: [backtestTool],
        tool_choice: "auto"
      } : useSearch ? {
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant with the ability to search for information.
When users ask questions that require current or factual information, use the search tool to find relevant details.
After searching, analyze and summarize the results to provide a comprehensive answer.
Always cite sources by including the URLs from the search results.

IMPORTANT: You MUST use the search tool for any questions about current events, news, or real-time information.
For example:
- "What's the latest news about Tesla?"
- "Find information about Bitcoin price"
- "Tell me about recent developments in AI"

When using the search tool:
1. Call it with a clear, focused query
2. Wait for the results
3. Analyze and summarize the findings
4. Include source URLs in your response`
          },
          ...messages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1000,
        stream: true,
        tools: [searchTool],
        tool_choice: { type: "function", function: { name: "search" } }
      } : {
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant specializing in financial markets and investing.
You provide clear, informative responses about:
- Stock market concepts and terminology
- Investment strategies and approaches
- Market analysis and trends
- Financial education and insights`
          },
          ...messages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1000,
        stream: true,
      }
    );

    console.log("[GROQ_CHAT] Creating streaming response");
    const stream = new ReadableStream({
      async start(controller) {
        let lastAudioTime = Date.now();
        const MIN_AUDIO_INTERVAL = 50;
        let audioBuffer = "";
        let processedLength = 0;  // Track how much text we've processed
        let currentWord = "";
        let audioProcessing = Promise.resolve();
        let isStreamClosed = false;  // Declare at the start of the function scope

        const processTextChunk = (content: string) => {
          try {
            const textChunk = JSON.stringify({ 
              type: "chunk", 
              content: content 
            }) + "\n";
            controller.enqueue(new TextEncoder().encode(textChunk));
            console.log("[GROQ_CHAT] Processed text chunk:", content);
          } catch (error: any) {
            console.error("[GROQ_CHAT] Error processing text chunk:", {
              message: error.message,
              stack: error.stack
            });
            throw error;
          }
        };

        const processSentences = async (text: string) => {
          try {
            console.log("[GROQ_CHAT] Processing sentences:", text);
            const sentences = text.match(/[^.!?]+[.!?]+/g);
            if (!sentences) return text;

            for (const sentence of sentences) {
              try {
                console.log("[GROQ_CHAT] Generating audio for sentence:", sentence.trim());
                const audioData = await textToSpeech(sentence.trim());
                
                const timeSinceLastAudio = Date.now() - lastAudioTime;
                if (timeSinceLastAudio < MIN_AUDIO_INTERVAL) {
                  await new Promise(resolve => setTimeout(resolve, MIN_AUDIO_INTERVAL - timeSinceLastAudio));
                }
                
                const chunk = JSON.stringify({
                  type: "audio",
                  content: Buffer.from(audioData).toString('base64')
                }) + "\n";
                
                controller.enqueue(new TextEncoder().encode(chunk));
                lastAudioTime = Date.now();
                console.log("[GROQ_CHAT] Successfully processed audio for sentence");
              } catch (error: any) {
                console.error("[GROQ_CHAT] Error processing sentence audio:", {
                  sentence: sentence.trim(),
                  message: error.message,
                  stack: error.stack
                });
              }
            }

            // Return any unprocessed text after the last complete sentence
            const lastSentence = sentences[sentences.length - 1];
            const lastSentenceIndex = text.lastIndexOf(lastSentence) + lastSentence.length;
            return text.slice(lastSentenceIndex);
          } catch (error: any) {
            console.error("[GROQ_CHAT] Error in sentence processing:", {
              message: error.message,
              stack: error.stack
            });
            throw error;
          }
        };

        const processAudioAsync = (text: string) => {
          audioProcessing = audioProcessing.then(async () => {
            try {
              // Only process new text
              const newText = text.slice(processedLength);
              if (!newText) return;

              if (/[.!?]/.test(newText)) {
                console.log("[GROQ_CHAT] Processing new complete sentence");
                const remainingText = await processSentences(newText);
                audioBuffer = remainingText;
                processedLength = text.length - remainingText.length;
              }
              else if (newText.length > 200) {
                console.log("[GROQ_CHAT] Processing new text due to length:", newText.length);
                const remainingText = await processSentences(newText + ".");
                audioBuffer = remainingText;
                processedLength = text.length - remainingText.length;
              }
            } catch (error: any) {
              console.error("[GROQ_CHAT] Error in audio processing:", {
                text: text,
                message: error.message,
                stack: error.stack
              });
            }
          }).catch((error: any) => {
            console.error("[GROQ_CHAT] Fatal audio processing error:", {
              message: error.message,
              stack: error.stack
            });
          });
        };

        try {
          console.log("[GROQ_CHAT] Starting completion stream processing");
          interface ToolCall {
            id: string | null;
            function: {
              name: string;
              arguments: string;
            }
          }

          let currentToolCall: ToolCall = {
            id: null,
            function: {
              name: '',
              arguments: ''
            }
          };
          let isCollectingToolCall = false;
          
          for await (const chunk of completion) {
            if (isStreamClosed) break;

            // Handle tool calls
            if (chunk.choices[0]?.delta?.tool_calls) {
              console.log(`
🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸
TOOL CALL CHUNK RECEIVED:
`, JSON.stringify(chunk, null, 2), `
🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸
`);
              const toolCallDelta = chunk.choices[0].delta.tool_calls[0];
              
              // Start collecting a new tool call
              if (toolCallDelta.index === 0) {
                isCollectingToolCall = true;
                currentToolCall = {
                  id: toolCallDelta.id || null,
                  function: {
                    name: toolCallDelta.function?.name || '',
                    arguments: toolCallDelta.function?.arguments || ''
                  }
                };
                console.log("Started new tool call:", currentToolCall);
              } else if (isCollectingToolCall) {
                // Accumulate tool call data
                if (toolCallDelta.function?.name) {
                  currentToolCall.function.name = toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                  currentToolCall.function.arguments += toolCallDelta.function.arguments;
                }
                console.log("Updated tool call:", currentToolCall);
              }
              continue;
            }

            // Check for tool call completion
            if (isCollectingToolCall && chunk.choices[0]?.finish_reason === 'tool_calls') {
              console.log("EXECUTING COMPLETED TOOL CALL:", JSON.stringify(currentToolCall, null, 2));
              
              try {
                if (currentToolCall.function.name === "search") {
                  // Send tool_call event
                  controller.enqueue(
                    new TextEncoder().encode(
                      JSON.stringify({
                        type: "tool_call",
                        tool: "search"
                      }) + "\n"
                    )
                  );
                  
                  const args = JSON.parse(currentToolCall.function.arguments);
                  const searchResults = await executeSearch(args);
                  
                  // Process search results text
                  if (searchResults.content?.text) {
                    // Send text chunk
                    processTextChunk(searchResults.content.text);
                    
                    // Process audio for the text
                    await processSentences(searchResults.content.text);
                  }
                  
                  // Send sources if available
                  if (searchResults.content?.sources) {
                    controller.enqueue(
                      new TextEncoder().encode(
                        JSON.stringify({
                          type: "sources",
                          content: searchResults.content.sources
                        }) + "\n"
                      )
                    );
                  }
                } else if (currentToolCall.function.name === "runBacktest") {
                  const args = JSON.parse(currentToolCall.function.arguments);
                  const graphData = await executeBacktest(args);
                  controller.enqueue(
                    new TextEncoder().encode(
                      JSON.stringify(graphData) + "\n"
                    )
                  );
                }
              } catch (error) {
                console.error("[GROQ_CHAT] Error executing tool call:", error);
              }

              // Reset tool call state
              isCollectingToolCall = false;
              currentToolCall = {
                id: null,
                function: {
                  name: '',
                  arguments: ''
                }
              };
              continue;
            }

            const content = chunk.choices[0]?.delta?.content || "";
            if (!content) {
              console.log("[GROQ_CHAT] Empty content chunk received");
              continue;
            }

            console.log("[GROQ_CHAT] Processing content chunk:", content);
            
            // Add to audio buffer and process audio asynchronously
            audioBuffer += content;
            processAudioAsync(audioBuffer);

            // Process text immediately
            for (let i = 0; i < content.length; i++) {
              const char = content[i];
              if (char === ' ' || char === '\n') {
                if (currentWord) {
                  processTextChunk(currentWord + char);
                  currentWord = "";
                } else {
                  processTextChunk(char);
                }
              } else {
                currentWord += char;
              }
            }
          }

          // Process any remaining text
          if (currentWord) {
            console.log("[GROQ_CHAT] Processing final word:", currentWord);
            processTextChunk(currentWord);
          }

          // Wait for audio processing to complete
          console.log("[GROQ_CHAT] Waiting for audio processing to complete");
          await audioProcessing;

          // Process any remaining audio
          if (audioBuffer.trim()) {
            console.log("[GROQ_CHAT] Processing remaining audio buffer");
            await processSentences(audioBuffer + ".");
          }

          console.log("[GROQ_CHAT] Stream processing completed successfully");
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ type: "done" }) + "\n"
            )
          );
          isStreamClosed = true;
        } catch (error: any) {
          console.error("[GROQ_CHAT] Stream processing error:", {
            message: error.message,
            stack: error.stack,
            phase: "stream_processing"
          });
          if (!isStreamClosed) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ 
                  type: "error", 
                  content: "Stream processing error: " + error.message
                }) + "\n"
              )
            );
            isStreamClosed = true;
          }
        } finally {
          if (!isStreamClosed) {
            console.log("[GROQ_CHAT] Closing stream controller");
            controller.close();
            isStreamClosed = true;
          }
        }
      }
    });

    console.log("[GROQ_CHAT] Returning stream response");
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("[GROQ_CHAT] Fatal API error:", {
      message: error.message,
      stack: error.stack,
      phase: "api_handler"
    });
    return new NextResponse("Internal Error: " + error.message, { status: 500 });
  }
}