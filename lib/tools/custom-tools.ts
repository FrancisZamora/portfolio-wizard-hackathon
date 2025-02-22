import { tool } from "ai";

// Tool 1: Calculate word frequency in a text
export const calculateWordFrequency = tool({
    name: "calculateWordFrequency",
    description: "Calculates how many times each word appears in a given text",
    parameters: {
        type: "object",
        properties: {
            text: {
                type: "string",
                description: "The text to analyze",
            },
        },
        required: ["text"],
    },
    handler: async ({ text }) => {
        const words = text.toLowerCase().match(/\b\w+\b/g) || [];
        const frequency: Record<string, number> = {};

        words.forEach((word) => {
            frequency[word] = (frequency[word] || 0) + 1;
        });

        return frequency;
    },
});

// Tool 2: Generate summary statistics
export const generateStats = tool({
    name: "generateStats",
    description: "Generates basic statistics about numbers in an array",
    parameters: {
        type: "object",
        properties: {
            numbers: {
                type: "array",
                items: { type: "number" },
                description: "Array of numbers to analyze",
            },
        },
        required: ["numbers"],
    },
    handler: async ({ numbers }) => {
        const sum = numbers.reduce((a, b) => a + b, 0);
        const avg = sum / numbers.length;
        const max = Math.max(...numbers);
        const min = Math.min(...numbers);

        return {
            sum,
            average: avg,
            maximum: max,
            minimum: min,
            count: numbers.length,
        };
    },
});
