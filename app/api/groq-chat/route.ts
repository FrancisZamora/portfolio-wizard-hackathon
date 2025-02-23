import { NextResponse } from "next/server";
import Groq from "groq-sdk";

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

// Define the graph generation tool
const graphTool = {
  type: "function" as const,
  function: {
    name: "generateGraph",
    description: "Generate a graph with data points. The graph can be random, uptrend, downtrend, or volatile.",
    parameters: {
      type: "object",
      properties: {
        graphType: {
          type: "string",
          description: "The type of graph to generate",
          enum: ["random", "uptrend", "downtrend", "volatile"]
        }
      },
      required: ["graphType"]
    }
  }
};

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

// Add classifier function
async function classifyBacktestQuery(query: string): Promise<number> {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a classifier that determines if a query is requesting stock backtesting analysis.
Score queries from 0 to 1 where:
1.0 = Definitely requesting stock backtesting (e.g. "backtest AAPL", "compare TSLA and GOOGL performance")
0.0 = Definitely general finance question (e.g. "what is a P/E ratio", "explain dividends")

High scoring indicators (0.9-1.0):
- Explicit mention of "backtest" with stock symbols
- Requesting performance comparison of specific stocks
- Analysis of specific stock performance over time periods
- Stock symbols present with words like "analyze", "compare", "performance"

Medium scoring indicators (0.5-0.8):
- Stock symbols present but no clear analysis request
- General market performance questions
- Historical price questions without specific analysis request

Low scoring indicators (0.0-0.4):
- General finance concepts
- Market terminology questions
- Investment strategy discussions
- No stock symbols present

RESPOND WITH ONLY A NUMBER between 0 and 1.`
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

    const score = parseFloat(completion.choices[0]?.message?.content || "0");
    return isNaN(score) ? 0 : score;
  } catch (error) {
    console.error("[CLASSIFIER_ERROR]", error);
    return 0;
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
    const backtestScore = await classifyBacktestQuery(lastMessage.content);
    console.log("[GROQ_CHAT] Backtest classification score:", backtestScore);

    // Route to backtest if score > 0.9, otherwise general chat
    const useBacktest = backtestScore > 0.9;

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
- User asks to analyze specific stocks

Example backtest requests that MUST trigger the tool:
- "Backtest AAPL and GOOGL"
- "Generate backtest for TSLA"
- "Compare Tesla and Ford stock performance"
- "Show me how MSFT and AMZN performed in 2023"
- "Analyze NVDA stock"

If the user mentions stock symbols, ALWAYS run the backtest.
Do not just provide general information when stock symbols are present.`
          },
          ...messages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1000,
        stream: true,
        top_p: 1.0,
        tools: [backtestTool],
        tool_choice: "auto"
      } : {
        messages: [
          {
            role: "system",
            content: `You are a helpful AI assistant specializing in financial markets and investing.
You provide clear, informative responses about:
- Stock market concepts and terminology
- Investment strategies and approaches
- Market analysis and trends
- Financial education and insights

Focus on being educational and informative while keeping explanations clear and accessible.
Use examples and analogies when helpful to illustrate concepts.

Remember to:
1. Provide balanced, factual information
2. Explain technical terms when using them
3. Highlight both benefits and risks when discussing investment strategies
4. Maintain a professional but conversational tone`
          },
          ...messages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1000,
        stream: true,
        top_p: 1.0,
      }
    ).catch(error => {
      console.error("[GROQ_CHAT] Groq API error:", {
        message: error.message,
        status: error.status,
        response: error.response,
        stack: error.stack
      });
      throw error;
    });

    console.log("[GROQ_CHAT] Creating streaming response");
    const stream = new ReadableStream({
      async start(controller) {
        let lastAudioTime = Date.now();
        const MIN_AUDIO_INTERVAL = 50;
        let audioBuffer = "";
        let processedLength = 0;  // Track how much text we've processed
        let currentWord = "";
        let audioProcessing = Promise.resolve();

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
          for await (const chunk of completion) {
            // Handle tool calls
            if (chunk.choices[0]?.delta?.tool_calls) {
              const toolCall = chunk.choices[0].delta.tool_calls[0];
              if (toolCall?.function?.name === "generateGraph" && toolCall.function.arguments) {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  const graphData = generateGraphData(args.graphType);
                  controller.enqueue(
                    new TextEncoder().encode(
                      JSON.stringify(graphData) + "\n"
                    )
                  );
                } catch (error) {
                  console.error("[GROQ_CHAT] Error processing tool call:", error);
                }
                continue;
              } else if (toolCall?.function?.name === "runBacktest" && toolCall.function.arguments) {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  const graphData = await executeBacktest(args);
                  controller.enqueue(
                    new TextEncoder().encode(
                      JSON.stringify(graphData) + "\n"
                    )
                  );
                } catch (error) {
                  console.error("[GROQ_CHAT] Error processing backtest:", error);
                }
                continue;
              }
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
        } catch (error: any) {
          console.error("[GROQ_CHAT] Stream processing error:", {
            message: error.message,
            stack: error.stack,
            phase: "stream_processing"
          });
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ 
                type: "error", 
                content: "Stream processing error: " + error.message
              }) + "\n"
            )
          );
        } finally {
          console.log("[GROQ_CHAT] Closing stream controller");
          controller.close();
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