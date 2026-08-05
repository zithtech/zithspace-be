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
  /** Technologies and tools found in the CV, used for opening skill matching. */
  skills: string[];
  rawText?: string;
}

/**
 * Fallback vocabulary for when the AI is unavailable. Deliberately short and
 * concrete: a keyword list can only ever find what it already knows, so it is a
 * safety net for the AI path, not a substitute for it.
 */
const SKILL_KEYWORDS = [
  'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'golang', 'rust', 'php', 'ruby', 'kotlin', 'swift', 'scala',
  'react', 'react native', 'next.js', 'angular', 'vue', 'svelte', 'node.js', 'express', 'nestjs', 'django', 'flask', 'fastapi',
  'spring', 'spring boot', 'laravel', 'rails', 'dotnet', '.net',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'oracle', 'sql server', 'dynamodb', 'cassandra',
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions', 'gitlab ci',
  'graphql', 'rest api', 'grpc', 'kafka', 'rabbitmq', 'microservices', 'serverless',
  'html', 'css', 'sass', 'tailwind', 'bootstrap', 'material ui', 'redux', 'jquery',
  'git', 'jira', 'figma', 'linux', 'bash', 'nginx',
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'nlp', 'computer vision',
  'selenium', 'cypress', 'jest', 'junit', 'playwright', 'postman',
  'agile', 'scrum', 'ci/cd', 'tdd', 'system design', 'data structures', 'algorithms',
];

/** De-duplicate case-insensitively while keeping the first spelling seen. */
function dedupeSkills(values: unknown, limit = 40): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const skill = v.trim().replace(/^[-•*]\s*/, '');
    if (!skill || skill.length > 60) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= limit) break;
  }
  return out;
}

/** Keyword sweep over the raw text — the heuristic path's skill extraction. */
function extractSkillsHeuristically(text: string): string[] {
  const haystack = text.toLowerCase();
  const found = SKILL_KEYWORDS.filter((kw) => {
    // Word-boundary match so "go" does not fire on "google" or "django".
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
  });
  // Title-case the canonical spelling so the UI does not show all lowercase.
  return found.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
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
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
    Extract the following information from the resume text provided.
    Return ONLY a JSON object with these exact keys.
    "name": (string) candidate's full name,
    "mobile": (string) primary contact number,
    "email": (string) email address,
    "total_experience": (number) total years of experience (extract as a number, e.g. 5, 2.5, 0 if none),
    "current_ctc": (number) current salary/CTC extracted as a number if mentioned (e.g. 1500000), else null,
    "expected_ctc": (number) expected salary/CTC extracted as a number if mentioned, else null,
    "skills": (array of strings) list of technologies, tools, frameworks and technical skills the candidate actually claims. Include at most 30. Exclude soft skills, job titles and company names.

    Resume Text:
    ${text.substring(0, 15000)}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let textResp = response.text().trim();

  // Cleanup in case model still outputs markdown despite JSON mode
  if (textResp.startsWith('\`\`\`json')) {
    textResp = textResp.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
  } else if (textResp.startsWith('\`\`\`')) {
    textResp = textResp.replace(/\`\`\`/g, '').trim();
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(textResp);
  } catch (err) {
    console.error('[pipeline] JSON parse error in AI resume parsing:', err);
    throw err;
  }

  return {
    name: parsed.name || '',
    mobile: parsed.mobile || '',
    email: parsed.email || '',
    total_experience: isNaN(Number(parsed.total_experience)) ? 0 : Number(parsed.total_experience),
    current_ctc: parsed.current_ctc && !isNaN(Number(parsed.current_ctc)) ? Number(parsed.current_ctc) : null,
    expected_ctc: parsed.expected_ctc && !isNaN(Number(parsed.expected_ctc)) ? Number(parsed.expected_ctc) : null,
    // If the model returns nothing usable, fall back rather than showing a
    // candidate with no skills at all.
    skills: (Array.isArray(parsed.skills) && dedupeSkills(parsed.skills).length)
      ? dedupeSkills(parsed.skills)
      : extractSkillsHeuristically(text),
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
    skills: extractSkillsHeuristically(text),
    rawText: text,
  };
}
