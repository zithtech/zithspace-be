import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import Tesseract from 'tesseract.js';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import dotenv from 'dotenv';
const pdfParse = require('pdf-parse');

dotenv.config();

const deepseekClient = process.env.DEEPSEEK_API_KEY ? new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
}) : null;

export async function extractAndHashAadhaar(base64File: string): Promise<string> {
  const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
  if (!matches) {
    throw new Error('Invalid file format');
  }

  const mimetype = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  let rawText = '';

  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    rawText = data.text;
  } else if (mimetype.includes('wordprocessingml') || mimetype === 'application/msword') {
    const tempPath = path.join(os.tmpdir(), `temp-${Date.now()}.docx`);
    fs.writeFileSync(tempPath, buffer);
    const result = await mammoth.extractRawText({ path: tempPath });
    fs.unlinkSync(tempPath);
    rawText = result.value;
  } else if (mimetype.startsWith('image/')) {
    // OCR using tesseract.js
    const result = await Tesseract.recognize(buffer, 'eng');
    rawText = result.data.text;
  } else {
    throw new Error('Unsupported file format for Aadhaar extraction.');
  }

  // Use Regex to find 12-digit Aadhaar number
  // Pattern: 4 digits, optional space/dash, 4 digits, optional space/dash, 4 digits
  const aadhaarRegex = /\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b/g;
  let matchesArray = [...rawText.matchAll(aadhaarRegex)];

  // Clean them up to standard 12-digit strings
  let potentialNumbers = matchesArray.map(m => `${m[1]}${m[2]}${m[3]}`);
  // Deduplicate
  potentialNumbers = [...new Set(potentialNumbers)];

  let finalAadhaar: string | null = null;

  if (potentialNumbers.length === 1) {
    finalAadhaar = potentialNumbers[0];
  } else if (potentialNumbers.length > 1 || potentialNumbers.length === 0) {
    // Ambiguous or none found using Regex. Try DeepSeek validation if available
    if (deepseekClient) {
      try {
        const response = await deepseekClient.chat.completions.create({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are an AI that extracts Indian Aadhaar numbers from OCR text. Respond with ONLY the 12-digit Aadhaar number with no spaces if found. If not found or if the text is not an Aadhaar card, respond with "NOT_FOUND".'
            },
            {
              role: 'user',
              content: rawText
            }
          ],
          temperature: 0,
        });

        const reply = response.choices[0].message.content?.trim() || 'NOT_FOUND';
        if (/^\d{12}$/.test(reply)) {
          finalAadhaar = reply;
        }
      } catch (err) {
        console.error('DeepSeek fallback failed:', err);
      }
    }
  }

  if (!finalAadhaar) {
    throw new Error('Could not extract a valid Aadhaar number from the provided document.');
  }

  // Hash it
  const hash = crypto.createHash('sha256').update(finalAadhaar).digest('hex');
  return hash;
}
