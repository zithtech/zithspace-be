import { AIResponse } from '../interfaces/AIResponse';
import { PricingResult } from '../interfaces/PricingResult';
import { CostCalculator } from './CostCalculator';
import { CreditCalculator } from './CreditCalculator';

export class AIPricingEngine {
    static async calculate(response: AIResponse<any>): Promise<PricingResult> {
        const providerCost = CostCalculator.calculateCost(response);
        const { credits, conversionRate } = await CreditCalculator.calculateCredits(providerCost);

        return {
            credits,
            providerCost,
            conversionRate,
            provider: response.provider,
            model: response.model,
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            aiRequestId: response.metadata?.requestId
        };
    }
}
