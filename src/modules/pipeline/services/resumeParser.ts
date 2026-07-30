// src/modules/pipeline/services/resumeParser.ts
import fs from 'fs';
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface ParsedResume {
  name: string;
  mobile: string;
  email: string;
  total_experience: number;
  current_ctc: number | null;
  expected_ctc: number | null;
  rawText?: string;
}

export async function parseResumeFile(filePath: string, mimetype: string): Promise<ParsedResume> {
  let rawText = '';

  if (mimetype === 'application/pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    rawText = data.text;
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    rawText = result.value;
  } else {
    throw new Error('Unsupported file format. Please upload PDF or DOCX.');
  }

  if (genAI) {
    try {
      return await parseWithAI(rawText);
    } catch (err) {
      console.warn('[pipeline] AI parsing failed, falling back to heuristic', err);
      return parseWithHeuristic(rawText);
    }
  }

  return parseWithHeuristic(rawText);
}

async function parseWithAI(text: string): Promise<ParsedResume> {
  if (!genAI) throw new Error('No GenAI');
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
  const prompt = `
    Extract the following information from the resume text provided.
    Return ONLY a JSON object (no markdown formatting, no backticks) with these exact keys:
    "name" (string, candidate's full name)
    "mobile" (string, primary contact number)
    "email" (string, email address)
    "total_experience" (number, total years of experience, output 0 if none)
    "current_ctc" (number, current salary in numbers if mentioned, else null)
    "expected_ctc" (number, expected salary in numbers if mentioned, else null)

    Resume Text:
    ${text.substring(0, 15000)}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let textResp = response.text().trim();
  if (textResp.startsWith('```json')) {
    textResp = textResp.replace(/```json/g, '').replace(/```/g, '').trim();
  }
  const parsed = JSON.parse(textResp);
  return {
    name: parsed.name || '',
    mobile: parsed.mobile || '',
    email: parsed.email || '',
    total_experience: Number(parsed.total_experience) || 0,
    current_ctc: parsed.current_ctc ? Number(parsed.current_ctc) : null,
    expected_ctc: parsed.expected_ctc ? Number(parsed.expected_ctc) : null,
    rawText: text,
  };
}

function parseWithHeuristic(text: string): ParsedResume {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = text.match(emailRegex);
  const email = emailMatch ? emailMatch[0] : '';

  const mobileRegex = /(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  const mobileMatch = text.match(mobileRegex);
  const mobile = mobileMatch ? mobileMatch[0] : '';

  return {
    name: 'Unknown (Please update)',
    mobile,
    email,
    total_experience: 0,
    current_ctc: null,
    expected_ctc: null,
    rawText: text,
  };
}
