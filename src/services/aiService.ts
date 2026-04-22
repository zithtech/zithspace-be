import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class AIService {
  static async analyzeLead(leadData: any) {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      Act as a Freelancer Bidding Coach & Market Analyst. Analyze the following lead data and provide a comprehensive "Bid-to-Win" strategy.
      
      Lead Data:
      - Title: ${leadData.title}
      - Description: ${leadData.summary || leadData.description}
      - Client Budget: ${leadData.budget}
      - Duration: ${leadData.duration}
      - Level: ${leadData.experience_level}
      - Hourly Rate: ${leadData.hourly_rate}
      - Client Payment Verified: ${leadData.client_payment_verified}

      YOUR TASK:
      Generate all intelligence metrics for the Bidiq Dashboard. Do NOT use generic placeholders. Use your market knowledge to estimate the true effort.

      1. REAL MARKET VALUE: What this project SHOULD cost in a professional market (Hours * $40-80/hr).
      2. SUGGESTED BID: A winning price for a freelancer (usually significantly lower than Market Value, but competitive for the Client Budget).
      3. STRATEGIC SCORE: A 0-100 score of how "good" this lead is (Higher = Better match/Safety/Pay).
      4. MATCH PERCENTAGE: A 0-100 score specifically about technical skill compatibility.
      5. REALITY GAPS: Contrast the client's expectations vs. reality.
         - Budget Gap %: (Market Value - Client Budget) / Client Budget * 100.
         - Timeline Reality: How many weeks/months it ACTUALLY takes.
         - Team Size: How many people are actually needed.
         - Revisions: How many rounds of feedback are likely needed.

      Return ONLY a STRICT JSON object:
      {
        "marketValue": number,
        "suggestedBid": number,
        "anchorPrice": number,
        "avgBidPrediction": number,
        "strategicScore": number,
        "matchPercentage": number,
        "clientQualityScore": number,
        "budgetFairnessScore": number,
        "predictedBidsCount": number,
        "summary": "string (tactical advice)",
        "complexity": "EASY" | "MEDIUM" | "COMPLEX",
        "estimatedHours": number,
        "gaps": {
          "budget": number,
          "timeline": "string",
          "teamSize": number,
          "revisions": number
        },
        "risks": [
          { "type": "red" | "yellow" | "grey", "title": "string", "desc": "string" }
        ]
      }
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      // Extract JSON from potential markdown blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (error) {
      console.error("Gemini AI Analysis Error:", error);
      throw new Error("Failed to analyze lead with AI");
    }
  }

  static async composeProposal(leadData: any) {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      Act as a Professional Solutions Architect. Write a winning project proposal for the following job.
      
      Job Title: ${leadData.title}
      Job Description: ${leadData.summary || leadData.description}
      Client: ${leadData.client_name}
      Suggested Total Budget: ${leadData.budget || '$1,000'}

      YOUR TASK:
      Generate a structured JSON of "Proposal Blocks" that auto-fills a proposal builder.
      Use professional, persuasive, and technically accurate language.

      Return ONLY a STRICT JSON array of blocks:
      [
        {
          "id": "cover-auto",
          "type": "cover",
          "data": { 
            "title": "Proposal for ${leadData.title.replace(/"/g, "'")}", 
            "clientName": "${leadData.client_name}", 
            "companyName": "Freelancer Services",
            "projectSummary": "string (Short summary for cover page)",
            "date": "${new Date().toISOString().split('T')[0]}"
          }
        },
        {
          "id": "summary-auto",
          "type": "text",
          "data": { "content": "<h1>Executive Summary</h1><p>Persuasive proposal summary...</p>" }
        },
        {
          "id": "scope-auto",
          "type": "scope",
          "data": {
            "title": "Scope of Work",
            "milestones": [
              { "id": "m1", "title": "Phase 1: Discovery", "deliverables": "Technical Requirements Doc", "tasks": "Requirement gathering\\nArchitecture design" }
            ],
            "terms": [
              { "id": "t1", "title": "Exclusions", "description": "Materials for print are not included.", "color": "#ef4444" }
            ]
          }
        },
        {
          "id": "timeline-auto",
          "type": "timeline",
          "data": {
            "title": "Project Timeline",
            "phases": [
              { "id": "p1", "title": "Discovery Phase", "deadline": "2024-05-10", "reviewPeriod": "2 Days", "description": "string" }
            ],
            "dependencyNotes": "string (Constraints)"
          }
        },
        {
          "id": "pricing-auto",
          "type": "pricing",
          "data": {
            "title": "Project Investment",
            "currency": "USD",
            "feeStructure": "Fixed Price",
            "items": [
              { "id": "i1", "name": "Phase 1 Development", "description": "Core features implementation", "quantity": 1, "price": 1000 }
            ],
            "paymentSchedule": "50% Initial Deposit\\n50% Completion",
            "paymentMethods": "Bank Transfer, Stripe",
            "taxesIncluded": false
          }
        },
        {
          "id": "sig-auto",
          "type": "signature",
          "data": { 
            "title": "Terms and Conditions",
            "companyName": "Freelancer Services",
            "clientName": "${leadData.client_name}",
            "companySigner": "Freelancer Name"
          }
        }
      ]
    `;

    try {
      const response = await model.generateContent(prompt);
      let text = response.response.text().trim();

      // CLEANUP: AI often wraps results in ```json ... ``` blocks
      // We must strip these to parse the raw JSON correctly.
      if (text.includes('```')) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          text = match[1].trim();
        }
      }

      // Try to parse as JSON if it looks like it
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          return JSON.parse(text);
        } catch (e) {
          console.warn('JSON Parse failed after cleanup, returning raw text');
          return text;
        }
      }

      return text;
    } catch (error: any) {
      console.error("Gemini AI Proposal Compose Error:", error);
      throw new Error("Failed to compose proposal with AI");
    }
  }
  static async refineProposalBlock(currentData: any, userPrompt: string, blockType: string) {
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });

    const prompt = `
      Act as a Professional Document Editor. Your goal is to rewrite or improve a SPECIFIC sub-section of a proposal block based on user instructions.
      
      BLOCK CONTEXT: ${blockType}
      SUB-SECTION DATA (The part being edited): ${JSON.stringify(currentData)}
      USER INSTRUCTION: "${userPrompt}"

      YOUR TASK:
      1. Analyze the specific sub-section provided.
      2. Rewrite or improve it according to the instruction.
      3. CRITICAL: Return ONLY the updated JSON for THIS SPECIFIC part. 
      4. DO NOT wrap it in a "data" object. 
      5. Maintain the EXACT same JSON schema as the input.
      6. IMPORTANT: DO NOT use HTML tags like <h1>, <h2>, <strong>, or <ul> in your response. Return pure, clean text content.

      Return ONLY a STRICT JSON object or string (depending on the input type). No markdown code blocks.
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      // Fix: Some AI responses include markdown code blocks
      if (text.includes('```')) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          text = match[1].trim();
        }
      }

      // Try to parse as JSON object/array
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // If JSON parse fails, fall through to text return
        }
      }

      // If it's a quoted string, strip quotes
      if (text.startsWith('"') && text.endsWith('"')) {
        return text.substring(1, text.length - 1);
      }

      return text;
    } catch (error) {
      console.error("Gemini AI Block Refinement Error:", error);
      throw new Error("Failed to refine block with AI");
    }
  }
}
