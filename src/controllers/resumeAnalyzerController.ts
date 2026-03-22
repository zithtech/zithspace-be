import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { tenantAwarePrisma } from "@/config/database";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

type SupportedMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!);

// Helper: Derive MIME type from URL or filename

function getMimeTypeFromUrl(url: string): SupportedMimeType {
  const cleanUrl = url.split("?")[0].toLowerCase();

  if (cleanUrl.endsWith(".pdf"))  return "application/pdf";
  if (cleanUrl.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (cleanUrl.endsWith(".txt"))  return "text/plain";

  // Default to PDF for R2/blob URLs with no recognizable extension
  return "application/pdf";
}

// Helper: Fetch remote file into a Buffer

async function fetchRemoteFile(
  url: string
): Promise<{ buffer: Buffer; mimeType: SupportedMimeType; originalName: string }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch resume from URL: ${response.status} ${response.statusText}`
    );
  }

  // Prefer Content-Type header; fall back to URL-based detection
  const contentType = response.headers.get("content-type") || "";

  let mimeType: SupportedMimeType;

  if (contentType.includes("pdf")) {
    mimeType = "application/pdf";
  } else if (contentType.includes("wordprocessingml") || contentType.includes("docx")) {
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (contentType.includes("text/plain")) {
    mimeType = "text/plain";
  } else {
    mimeType = getMimeTypeFromUrl(url);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Extract a readable filename from the URL path
  const urlPath = new URL(url).pathname;
  const originalName = decodeURIComponent(urlPath.split("/").pop() || "resume");

  return { buffer, mimeType, originalName };
}

// Helper: Upload file buffer to Gemini File API
async function uploadToGemini(
  buffer: Buffer,
  mimeType: SupportedMimeType,
  originalName: string
): Promise<string> {
  const ext =
    mimeType === "application/pdf"
      ? ".pdf"
      : mimeType.includes("word")
      ? ".docx"
      : ".txt";

  const tempFilePath = path.join(os.tmpdir(), `resume_${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tempFilePath, buffer);

    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType,
      displayName: originalName,
    });

    return uploadResponse.file.uri;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// Helper: Build the AI prompt
function buildPrompt(job: any, resumeText?: string): string {
  const hasMandatorySkills = (job.mandatorySkills || []).length > 0;
  const hasSecondarySkills = (job.secondarySkills || []).length > 0;

  return `
You are a highly accurate AI recruitment evaluator.

Your task is to:
1) Extract candidate details
2) Extract education details
3) Analyze each work experience in depth — list skills learned/used and estimate proficiency percentage
4) Analyze resume vs job match including BOTH mandatory and secondary skill sets
5) Provide realistic scoring (no inflation)

Return ONLY valid JSON with no extra text, no markdown fences:

{
  "candidate": {
    "name": "",
    "email": "",
    "phone": "",
    "linkedIn": "",
    "location": "",
    "totalExperience": "",
    "currentCompany": "",
    "currentRole": ""
  },
  "education": [
    {
      "degree": "",
      "fieldOfStudy": "",
      "institution": "",
      "location": "",
      "graduationYear": "",
      "grade": ""
    }
  ],
  "workExperience": [
    {
      "company": "",
      "role": "",
      "duration": "July 2023 - Present",
      "experience": "1 year 8 months",
      "description": "",
      "skillsAnalysis": [
        {
          "skill": "React",
          "category": "mandatory",
          "proficiency": 85,
          "context": "Built reusable component library and managed state with Redux"
        },
        {
          "skill": "Node.js",
          "category": "mandatory",
          "proficiency": 75,
          "context": "Developed REST APIs and middleware for authentication"
        },
        {
          "skill": "Next.js",
          "category": "secondary",
          "proficiency": 60,
          "context": "Used for SSR pages in a client-facing portal project"
        }
      ]
    }
  ],
  "match": {
    "overallMatch": 0,
    "skillMatch": 0,
    "experienceMatch": 0,
    "locationMatch": 0,
    "mandatorySkills": {
      "matched": [],
      "missing": [],
      "matchPercentage": 0
    },
    "secondarySkills": {
      "matched": [],
      "missing": [],
      "matchPercentage": 0
    },
    "summary": ""
  }
}

---

EDUCATION EXTRACTION RULES:

- Extract ALL education entries found in the resume (degrees, diplomas, certifications from institutions)
- "degree": The qualification type (e.g. "B.E.", "B.Tech", "M.Sc", "MBA", "Diploma")
- "fieldOfStudy": The subject/major (e.g. "Computer Science and Engineering", "Information Technology")
- "institution": Full name of the university, college, or school
- "location": City and state/country of the institution
- "graduationYear": Year of completion or expected graduation (e.g. "2022", "2024 (Expected)")
- "grade": CGPA, percentage, or grade if mentioned — use null if not stated

---

WORK EXPERIENCE ANALYSIS RULES:

For each work experience entry:

- "duration": The date range exactly as written in the resume
    Format: "Month Year - Month Year" or "Month Year - Present"
    Example: "July 2023 - Present" or "August 2022 - December 2022"
    Use the exact month names and years as they appear — do NOT abbreviate or reformat

- "experience": The calculated length of time spent in that role
    Format: "X year Y months" or "X years Y months" or "Y months" (if under 1 year)
    Examples: "1 year 8 months", "2 years 3 months", "5 months"
    Calculate from the duration dates — if end date is "Present", calculate up to today (${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })})
    Use singular "year" for exactly 1 year, plural "years" for 2+
    Omit months if exactly 0 months remain (e.g. "2 years" not "2 years 0 months")

- "description": A 1-2 sentence summary of what the candidate did in that role

- "skillsAnalysis": An array of skills learned or actively used in that role
  - "skill": The exact skill name (e.g. "React", "Docker", "PostgreSQL")

  - "category": Classify EACH skill as one of:
      "mandatory" — if the skill appears in the Mandatory Skills list below
      "secondary" — if the skill appears in the Secondary Skills list below
      "general"   — if the skill is present in the resume but not in either list

  - "proficiency": A percentage (0-100) estimating depth of usage.
    CRITICAL — Secondary skills MUST be weighted differently:
      If a secondary skill has limited usage, do NOT inflate it to match mandatory skill scores.
      Score it based purely on evidence in the resume for that role.
      Secondary skills that are mentioned in passing score LOWER than secondary skills
      that were a core part of the role's responsibilities.
    DO NOT guess — only include skills explicitly or strongly implied in the resume.

  - "context": One sentence explaining HOW they used this skill in that specific role.

PROFICIENCY ESTIMATION GUIDE (applies to ALL skill categories):
  0-30%   -> Mentioned briefly, beginner level, or no supporting detail
  31-55%  -> Used for basic tasks, limited scope or duration
  56-75%  -> Regular usage, moderate complexity
  76-90%  -> Core part of their role, significant depth and ownership
  91-100% -> Expert-level, led architecture or mentored others using this skill

---

MATCH SCORING RULES:

- skillMatch (overall skill score, 0-100):
  Weighted combination:
    Mandatory skills carry 70% of the weight
    Secondary skills carry 30% of the weight
  Formula:
    skillMatch = (mandatorySkills.matchPercentage * 0.70) + (secondarySkills.matchPercentage * 0.30)
  ${!hasMandatorySkills ? "No mandatory skills provided — base skillMatch entirely on secondary skills." : ""}
  ${!hasSecondarySkills ? "No secondary skills provided — base skillMatch entirely on mandatory skills (ignore the 30% secondary weight)." : ""}

- mandatorySkills:
  - "matched": Mandatory skills found anywhere in the resume's skillsAnalysis
  - "missing": Mandatory skills NOT found anywhere in the resume
  - "matchPercentage": (matched.length / total mandatory skills) * 100
  ${!hasMandatorySkills ? "No mandatory skills provided — set matchPercentage to 0 and both arrays to []." : ""}

- secondarySkills:
  - "matched": Secondary skills found anywhere in the resume's skillsAnalysis
  - "missing": Secondary skills NOT found anywhere in the resume
  - "matchPercentage": (matched.length / total secondary skills) * 100
  ${!hasSecondarySkills ? "No secondary skills provided — set matchPercentage to 0 and both arrays to []." : ""}

- experienceMatch:
  Based on total years of experience + role relevance to job title

- locationMatch:
  If Remote -> high match
  Else compare candidate city/region to job location

- overallMatch:
  Weighted combination: skillMatch (50%) + experienceMatch (35%) + locationMatch (15%)
  DO NOT average blindly — adjust weight if a factor is clearly dominant or irrelevant
  DO NOT inflate scores

---

STRUCTURED JOB DATA:

Title: ${job.jobTitle}
Experience Required: ${job.experience || "Not specified"}
Location: ${job.jobLocation || "Not specified"}
Work Mode: ${job.workMode || "Not specified"}

Mandatory Skills (HIGH weight — 70% of skillMatch):
${hasMandatorySkills ? (job.mandatorySkills || []).join(", ") : "None provided"}

Secondary Skills (MEDIUM weight — 30% of skillMatch):
${hasSecondarySkills ? (job.secondarySkills || []).join(", ") : "None provided"}

---

JOB DESCRIPTION:

Role:
${job.jobRole || ""}

Responsibilities:
${job.responsibilities || ""}

Details:
${job.jobDetails || ""}

---

${
  resumeText
    ? `RESUME TEXT:\n${resumeText}`
    : "The resume is attached as a file. Read it carefully including all tables, columns, and sections."
}
`.trim();
}

const clamp = (num: number): number => Math.max(0, Math.min(100, num || 0));

export const analyzeResume = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {

    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { ticketId, resumeUrl } = req.body;

    if (!ticketId) {
      res.status(400).json({
        success: false,
        error: "ticketId is required",
      } as ApiResponse);
      return;
    }

    let resumeBuffer: Buffer;
    let mimeType: SupportedMimeType;
    let originalName: string;

    if (resumeUrl) {
      try {
        ({ buffer: resumeBuffer, mimeType, originalName } =
          await fetchRemoteFile(resumeUrl));
      } catch (fetchError: any) {
        res.status(400).json({
          success: false,
          error: `Could not fetch resume from URL: ${fetchError.message}`,
        } as ApiResponse);
        return;
      }
    } 
    else {
      res.status(400).json({
        success: false,
        error: "ResumeUrl is required.",
      } as ApiResponse);
      return;
    }

    //Fetch job requisition

    const tenantId = req.tenantId;

    const job = await tenantAwarePrisma.withTenant(
      tenantId,
      async (client) =>
        client.jobRequisition.findUnique({
          where: {
            tenantId_ticketId: { tenantId, ticketId },
          },
        })
    );

    if (!job) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let result:any;

    if (mimeType === "text/plain") {
      // Plain text: send inline
      const resumeText = resumeBuffer.toString("utf-8");
      const prompt = buildPrompt(job, resumeText);
      result = await model.generateContent(prompt);
    } else {
      // PDF / DOCX: upload to Gemini File API
      // Preserves tables, columns, and visual layout that text extraction loses
      const fileUri = await uploadToGemini(resumeBuffer, mimeType, originalName);
      const prompt = buildPrompt(job);

      result = await model.generateContent([
        {
          fileData: {
            fileUri,
            mimeType,
          },
        },
        {
          text: prompt,
        },
      ]);
    }

    // Parse AI response 

    const response = await result.response;

    let aiText: string = response.text();

    aiText = aiText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: any;

    try {
      parsed = JSON.parse(aiText);
    } catch (err) {
      console.error("JSON parse failed. Raw AI text:", aiText);
      res.status(500).json({
        success: false,
        error: "AI response parsing failed. The model returned invalid JSON.",
        raw: aiText,
      } as ApiResponse);
      return;
    }

    if (!parsed.candidate || !parsed.match) {
      res.status(500).json({
        success: false,
        error: "AI response missing required fields (candidate or match).",
        raw: parsed,
      } as ApiResponse);
      return;
    }

  //score 
    parsed.match.skillMatch      = clamp(parsed.match.skillMatch);
    parsed.match.experienceMatch = clamp(parsed.match.experienceMatch);
    parsed.match.locationMatch   = clamp(parsed.match.locationMatch);
    parsed.match.overallMatch    = clamp(parsed.match.overallMatch);

    // Ensure mandatory/secondary skill objects exist safely
    const mandatorySkills = parsed.match.mandatorySkills || {};
    const secondarySkills = parsed.match.secondarySkills || {};

    // Ensure all array fields are safe
    mandatorySkills.matched         = Array.isArray(mandatorySkills.matched)  ? mandatorySkills.matched  : [];
    mandatorySkills.missing         = Array.isArray(mandatorySkills.missing)  ? mandatorySkills.missing  : [];
    mandatorySkills.matchPercentage = clamp(mandatorySkills.matchPercentage   || 0);
    secondarySkills.matched         = Array.isArray(secondarySkills.matched)  ? secondarySkills.matched  : [];
    secondarySkills.missing         = Array.isArray(secondarySkills.missing)  ? secondarySkills.missing  : [];
    secondarySkills.matchPercentage = clamp(secondarySkills.matchPercentage   || 0);
    parsed.workExperience           = Array.isArray(parsed.workExperience)    ? parsed.workExperience    : [];
    parsed.education                = Array.isArray(parsed.education)         ? parsed.education         : [];

    //final structured response

    const formatted = {
      candidate: {
        name:            parsed.candidate.name            || null,
        email:           parsed.candidate.email           || null,
        phone:           parsed.candidate.phone           || null,
        linkedIn:        parsed.candidate.linkedIn        || null,
        location:        parsed.candidate.location        || null,
        totalExperience: parsed.candidate.totalExperience || null,
        currentCompany:  parsed.candidate.currentCompany  || null,
        currentRole:     parsed.candidate.currentRole     || null,
      },

      // Education details extracted from resume
      education: parsed.education.map((edu: any) => ({
        degree:         edu.degree         || null,
        fieldOfStudy:   edu.fieldOfStudy   || null,
        institution:    edu.institution    || null,
        location:       edu.location       || null,
        graduationYear: edu.graduationYear || null,
        grade:          edu.grade          || null,
      })),

      // Each experience has duration range, calculated experience length,
      // and a full skill breakdown with category, proficiency % and context
      workExperience: parsed.workExperience.map((exp: any) => ({
        company:     exp.company     || null,
        role:        exp.role        || null,
        duration:    exp.duration    || null,   // e.g. "July 2023 - Present"
        experience:  exp.experience  || null,   // e.g. "1 year 8 months"
        description: exp.description || null,

        skillsAnalysis: Array.isArray(exp.skillsAnalysis)
          ? exp.skillsAnalysis.map((s: any) => ({
              skill:       s.skill || null,
              // category flags whether this skill is mandatory, secondary, or general
              category:    ["mandatory", "secondary", "general"].includes(s.category)
                             ? s.category
                             : "general",
              proficiency: clamp(s.proficiency), // guaranteed 0-100
              context:     s.context || null,
            }))
          : [],
      })),

      match: {
        overallMatch: parsed.match.overallMatch,
        breakdown: {
          skillMatch:      parsed.match.skillMatch,
          experienceMatch: parsed.match.experienceMatch,
          locationMatch:   parsed.match.locationMatch,
        },
        // Mandatory skills breakdown
        mandatorySkills: {
          matched:         mandatorySkills.matched,
          missing:         mandatorySkills.missing,
          matchPercentage: mandatorySkills.matchPercentage,
        },
        // Secondary skills breakdown (empty arrays + 0 if no secondary skills on job)
        secondarySkills: {
          matched:         secondarySkills.matched,
          missing:         secondarySkills.missing,
          matchPercentage: secondarySkills.matchPercentage,
        },
        summary: parsed.match.summary || "",
      },
    };

    res.status(200).json({
      success: true,
      data: formatted,
      message: "AI-based resume analysis completed",
    } as ApiResponse);

  } catch (error) {
    console.error("Error analyzing resume:", error);
    res.status(500).json({
      success: false,
      error: "Failed to analyze resume",
    } as ApiResponse);
  }
};