import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI((process.env.API_KEY || "").trim());
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export interface DocumentNode {
  title: string;
  type: "file" | "folder" | "section";
  children?: DocumentNode[];
  contentPrompt?: string;
}

export class AIService {
  /** 
   * Helper to clean AI response text for JSON parsing
   */
  private static cleanJSONResponse(text: string): string {
    return text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
  }

  /**
   * Generate a document hub structure based on a prompt
   */
  static async generateHubStructure(prompt: string): Promise<{ suggestedTitle: string, structure: DocumentNode[] }> {
    const systemPrompt = `
      You are an expert technical writer and document architect.
      Based on the following request, suggest a hierarchical structure for a documentation hub and a relevant title for it.
      The output MUST be a valid JSON object.
      Return ONLY the JSON. No markdown, no explanation.
    `;

    const userPrompt = `Request: "${prompt}"
      Format:
      {
        "suggestedTitle": "A proper and relevant title for the hub",
        "structure": [
          {
            "title": (string),
            "type": (string: "file", "folder", or "section"),
            "children": (optional array of same types),
            "contentPrompt": (optional string description for files)
          }
        ]
      }
    `;

    try {
      const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      const text = this.cleanJSONResponse(result.response.text());
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Generate Hub Structure Error:", error);
      throw new Error("Failed to architect hub structure");
    }
  }

  /**
   * Generate BlockNote-compatible content for a document
   */
  static async generateDocumentContent(title: string, context: string): Promise<any[]> {
    const systemPrompt = `
      You are an expert documentation writer. Generate comprehensive content in BlockNote JSON format.
      Return ONLY the JSON array. No markdown.
    `;

    const userPrompt = `Document Title: "${title}"
      Context: "${context}"
      Format: Array of blocks with id, type (paragraph, heading, bulletListItem, numberedListItem, checkListItem), props, content, and children.
      Requirement: Provide extremely comprehensive and detailed professional documentation content for this specific topic. Include at least 5-10 distinct blocks including multiple subheadings, detailed paragraphs, and list items. Ensure the content is rich, technical, and highly relevant. Must be valid JSON and BlockNote compatible.
    `;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        const text = this.cleanJSONResponse(result.response.text());
        let blocks;
        try {
          blocks = JSON.parse(text);
        } catch (parseError) {
          console.error(`Attempt ${attempts + 1}: Failed to parse AI content JSON:`, text);
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            continue;
          }
          return [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Documentation for ${title}.`, styles: {} }]
            }
          ];
        }

        if (!Array.isArray(blocks) || blocks.length === 0) {
          attempts++;
          if (attempts < maxAttempts) continue;
          return [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Detailed overview of ${title} will be provided here.`, styles: {} }]
            }
          ];
        }
        return blocks;
      } catch (error) {
        console.error(`Attempt ${attempts + 1}: AI Generate Document Content Error:`, error);
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          continue;
        }
        return [
          {
            type: "paragraph",
            content: [{ type: "text", text: `Content generation for ${title} is in progress.`, styles: {} }]
          }
        ];
      }
    }
    return []; // Should not reach here
  }

  /**
   * Process a natural language command for CRUD operations
   */
  static async processCommand(command: string, context: any): Promise<any> {
    const systemPrompt = `
      You are an AI assistant for a Document Hub application.
      Identify the intent: "CREATE", "UPDATE", "DELETE", or "MOVE".
      Return a JSON object with intent, targets, params, and explanation.
      Return ONLY the JSON.
    `;

    const userContent = `Command: "${command}"\nContext: ${JSON.stringify(context)}`;

    try {
      const result = await model.generateContent(`${systemPrompt}\n\n${userContent}`);
      const text = this.cleanJSONResponse(result.response.text());
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Process Command Error:", error);
      throw new Error("Failed to interpret command");
    }
  }

  /**
   * Process selected text based on a user prompt
   */
  static async processSelectedText(selectedText: string, prompt: string): Promise<string> {
    const systemPrompt = `
      You are an expert editor and AI assistant.
      The user has selected some text and provided an instruction.
      Process the text according to the instruction.
      Return ONLY the processed text. No explanation, no quotes unless requested.
    `;

    const userPrompt = `Selected Text: "${selectedText}"\nInstruction: "${prompt}"`;

    try {
      const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      return result.response.text().trim();
    } catch (error) {
      console.error("AI Process Selected Text Error:", error);
      throw new Error("Failed to process selected text");
    }
  }
}
