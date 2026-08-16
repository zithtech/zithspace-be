import { AIResponse } from '../interfaces/AIResponse';
import { PricingStrategyFactory } from '../providers/pricing/PricingStrategyFactory';

export class PricingCalculationException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PricingCalculationException';
    }
}

export class CostCalculator {
    static calculateCost(response: AIResponse<any>): number {
        if (!response.usage) {
            throw new PricingCalculationException('Missing usage data in AIResponse');
        }

        const { promptTokens, completionTokens } = response.usage;
        if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') {
            throw new PricingCalculationException('Invalid token counts in AIResponse usage');
        }

        const strategy = PricingStrategyFactory.getStrategy(response.provider);
        const pricing = strategy.getPricing(response.model);

        const promptCost = (promptTokens / 1000) * pricing.inputCostPer1k;
        const completionCost = (completionTokens / 1000) * pricing.outputCostPer1k;

        return promptCost + completionCost;
    }
}
