#!/usr/bin/env node
/**
 * PDF Processing Script for Local RAG
 * 
 * This script processes PDF files and creates embeddings for RAG-based
 * educational content grounding. It uses Gemini for both text extraction
 * and embedding generation.
 * 
 * Usage: node scripts/process-pdfs.js
 */

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PDF_DIR = path.join(__dirname, '..', 'attached_assets');
const OUTPUT_FILE = path.join(__dirname, '..', 'assets', 'medical-knowledge.json');

const CHUNK_SIZE = 800; // words per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks

async function callGeminiAPI(endpoint, body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${endpoint}?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

async function extractTextFromPDF(pdfPath) {
  console.log(`  Extracting text from: ${path.basename(pdfPath)}`);
  
  const pdfData = fs.readFileSync(pdfPath);
  const base64PDF = pdfData.toString('base64');
  
  const response = await callGeminiAPI('models/gemini-3.6-flash:generateContent', {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64PDF,
          },
        },
        {
          text: `Extract all the text content from this medical PDF document. 
Preserve the structure including section headings, paragraphs, and key information.
Focus on educational content about pulmonary health, surfactant, lung diseases, and treatments.
Return the full extracted text, maintaining readability.`,
        },
      ],
    }],
  });
  
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

function chunkText(text, source) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunkWords = words.slice(i, i + CHUNK_SIZE);
    if (chunkWords.length < 50) continue; // Skip very small chunks
    
    const chunkText = chunkWords.join(' ');
    chunks.push({
      id: `${source}_chunk_${chunks.length}`,
      text: chunkText,
      source: source,
      chunkIndex: chunks.length,
    });
  }
  
  return chunks;
}

async function generateEmbedding(text) {
  const response = await callGeminiAPI('models/gemini-embedding-001:embedContent', {
    model: 'models/gemini-embedding-001',
    content: {
      parts: [{ text: text.slice(0, 8000) }], // Limit text length
    },
    outputDimensionality: 768,
    taskType: 'RETRIEVAL_DOCUMENT',
  });

  return (
    response.embedding?.values ||
    response.embedding?.value ||
    (Array.isArray(response.embeddings) && response.embeddings[0]?.values) ||
    []
  );
}

async function processAllPDFs() {
  console.log('\n📚 Starting PDF Processing for RAG System\n');
  
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY environment variable is not set');
    process.exit(1);
  }
  
  // Find unique PDF files (avoid duplicates)
  const allFiles = fs.readdirSync(PDF_DIR);
  const pdfFiles = allFiles.filter(f => f.endsWith('.pdf'));
  
  // Deduplicate by base name (before timestamp)
  const uniquePDFs = new Map();
  for (const file of pdfFiles) {
    const baseName = file.replace(/_\d+\.pdf$/, '');
    if (!uniquePDFs.has(baseName)) {
      uniquePDFs.set(baseName, file);
    }
  }
  
  console.log(`Found ${uniquePDFs.size} unique PDFs to process:\n`);
  
  const allChunks = [];
  
  for (const [baseName, fileName] of uniquePDFs) {
    console.log(`\n📄 Processing: ${baseName}`);
    const pdfPath = path.join(PDF_DIR, fileName);
    
    try {
      // Extract text
      const text = await extractTextFromPDF(pdfPath);
      console.log(`  ✓ Extracted ${text.split(/\s+/).length} words`);
      
      // Chunk the text
      const chunks = chunkText(text, baseName);
      console.log(`  ✓ Created ${chunks.length} chunks`);
      
      // Generate embeddings for each chunk
      console.log(`  ⏳ Generating embeddings...`);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        chunk.embedding = await generateEmbedding(chunk.text);
        
        // Progress indicator
        if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
          process.stdout.write(`\r  ✓ Embedded ${i + 1}/${chunks.length} chunks`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      console.log('');
      
      allChunks.push(...chunks);
    } catch (error) {
      console.error(`  ❌ Error processing ${fileName}: ${error.message}`);
    }
  }
  
  // Save to JSON
  const output = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    totalChunks: allChunks.length,
    sources: [...uniquePDFs.keys()],
    chunks: allChunks,
  };
  
  // Ensure assets directory exists
  const assetsDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  const fileSizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  
  console.log('\n✅ Processing Complete!');
  console.log(`   Total chunks: ${allChunks.length}`);
  console.log(`   Output file: ${OUTPUT_FILE}`);
  console.log(`   File size: ${fileSizeKB} KB\n`);
}

processAllPDFs().catch(console.error);
