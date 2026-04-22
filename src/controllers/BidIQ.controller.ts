import { Response } from "express";
import { AuthRequest } from "@/types";
import { LeadModel } from "@/models/Lead.model";
import { BidIQModel } from "../models/BidIQ.model";
import { AIService } from "../services/aiService";

export class BidIQController {
  static async analyzeLead(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const tenantId = req.tenantId;

    try {
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const lead = await LeadModel.findById(id, tenantId);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // 1. Check if AI Intelligence is already cached in the NEW table
      const cachedData = await BidIQModel.findByLeadId(id, tenantId);
      if (cachedData) {
          console.log(`[BidIQ] Serving cached intelligence for lead ${id}`);
          return res.status(200).json(cachedData);
      }

      // 2. Perform fresh AI analysis
      const intelligence = await AIService.analyzeLead(lead);

      // 3. Store in the NEW separate table only
      const bidiqResult = await BidIQModel.upsert({
        lead_id: id,
        tenant_id: tenantId,
        strategic_score: intelligence.strategicScore || 0,
        skill_match_percentage: intelligence.matchPercentage || 0,
        market_value: intelligence.marketValue || 0,
        suggested_bid: intelligence.suggestedBid || 0,
        anchor_price: intelligence.anchorPrice,
        avg_bid_prediction: intelligence.avgBidPrediction,
        client_quality_score: intelligence.clientQualityScore,
        budget_fairness_score: intelligence.budgetFairnessScore,
        predicted_bids_count: intelligence.predictedBidsCount,
        complexity: intelligence.complexity,
        estimated_hours: intelligence.estimatedHours,
        summary: intelligence.summary,
        gaps: intelligence.gaps,
        risks: intelligence.risks,
        missing_skills: intelligence.missingSkills
      });

      return res.status(200).json(bidiqResult);
    } catch (error) {
      console.error("BidIQ Controller Error:", error);
      return res.status(500).json({ message: "Failed to perform AI analysis" });
    }
  }
}
