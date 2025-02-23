import { NextResponse } from "next/server";
import {
  LlamaParseReader,
  Document as LlamaDocument
} from "llamaindex";
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface ParsedDocument {
  text: string;
  [key: string]: any;
}

export async function POST(req: Request) {
  try {
    const { pdfUrl } = await req.json();

    if (!pdfUrl) {
      return new NextResponse("PDF URL is required", { status: 400 });
    }

    // Download the PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    // Create a temporary file path
    const tempFilePath = join(tmpdir(), `pdf-${Date.now()}.pdf`);
    
    // Write the PDF to a temporary file
    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tempFilePath, pdfBuffer);

    // Set up the llamaparse reader
    const reader = new LlamaParseReader({ 
      resultType: "markdown",
      apiKey: process.env.LLAMA_CLOUD_API_KEY
    });

    // Parse the document
    const documents = await reader.loadData(tempFilePath);

    // Extract text content from documents
    let content = '';
    try {
      if (Array.isArray(documents)) {
        content = (documents as ParsedDocument[])
          .map(doc => doc.text || '')
          .filter(Boolean)
          .join('\n\n');
      } else if (typeof documents === 'object' && documents !== null) {
        const doc = documents as ParsedDocument;
        content = doc.text || '';
      } else {
        content = String(documents || '');
      }
    } catch (err) {
      console.error("[PARSE_ERROR] Failed to extract text:", err);
      content = String(documents || '');
    }

    // Extract and format financial statements section
    const financialSection = formatFinancialSection(content);

    // Clean up the temporary file
    await writeFile(tempFilePath, '').catch(console.error);

    return NextResponse.json({ 
      success: true, 
      content: financialSection || 'Financial statements section not found'
    });

  } catch (error: any) {
    console.error("[PDF_PARSE_ERROR]", error);
    return new NextResponse(`PDF parsing error: ${error.message}`, { status: 500 });
  }
}

function formatFinancialSection(content: string): string {
  // Look for the financial statements section
  const startMarker = "PART I — FINANCIAL INFORMATION";
  const endMarkers = [
    "PART II",
    "Item 2.",
    "Management's Discussion"
  ];

  let startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return '';

  // Find the closest end marker
  let endIndex = content.length;
  for (const marker of endMarkers) {
    const index = content.indexOf(marker, startIndex + startMarker.length);
    if (index !== -1 && index < endIndex) {
      endIndex = index;
    }
  }

  // Extract the section
  let section = content.slice(startIndex, endIndex).trim();

  // Format the content with proper headers and structure
  const formattedContent = formatContent(section);
  
  return formattedContent;
}

function formatContent(content: string): string {
  // Split content into lines
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Initialize formatted content with main header
  let formatted = '# PART I — FINANCIAL INFORMATION\n\n';
  
  // Process lines and format them appropriately
  let inTable = false;
  let tableStarted = false;
  let columnCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for major headers
    if (line.includes('CONDENSED CONSOLIDATED STATEMENTS')) {
      inTable = false;
      tableStarted = false;
      formatted += `\n## ${line}\n\n`;
      continue;
    }
    
    // Check for table metadata (periods, units)
    if (line.toLowerCase().includes('months ended') || line.toLowerCase().includes('(in millions')) {
      formatted += `*${line}*\n\n`;
      continue;
    }

    // Detect start of table data
    if (!tableStarted && line.includes('$') || /^[\w\s,]+$/.test(line)) {
      tableStarted = true;
      inTable = true;
      
      // Count columns based on the first data row
      const nextLine = lines[i + 1] || '';
      const numbers = nextLine.match(/\d+|\(\d+\)/g) || [];
      columnCount = numbers.length + 1; // +1 for the description column
      
      // Add table header separator
      formatted += '| Item |' + ' Amount |'.repeat(columnCount - 1) + '\n';
      formatted += '|' + ':---|'.repeat(columnCount) + '\n';
    }
    
    // Handle table content
    if (inTable) {
      const parts = line.split(/\s+(?=\$|\d|\()/);
      if (parts.length > 0) {
        const description = parts[0];
        const values = parts.slice(1);
        
        // Format numbers with proper alignment
        let formattedLine = `| ${description} |`;
        values.forEach(value => {
          // Clean up the value and ensure proper spacing
          const cleanValue = value.trim()
            .replace(/\s+/g, '')
            .replace(/\((\d+)\)/, '($1)'); // Ensure consistent parentheses spacing
          formattedLine += ` ${cleanValue} |`;
        });
        
        // Pad missing columns if necessary
        while (formattedLine.split('|').length <= columnCount) {
          formattedLine += ' — |';
        }
        
        formatted += formattedLine + '\n';
      }
    } else {
      // Regular content
      formatted += `${line}\n`;
    }
  }
  
  return formatted;
} 