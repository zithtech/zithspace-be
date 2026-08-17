import { ProviderPricingStrategy } from './ProviderPricingStrategy';

export class OpenAIPricingStrategy implements ProviderPricingStrategy {
    getPricing(model: string): { inputCostPer1k: number; outputCostPer1k: number } {
        // Fallbacks for common models
        if (model.includes('gpt-4o')) {
            return { inputCostPer1k: 0.005, outputCostPer1k: 0.015 };
        }
        if (model.includes('gpt-3.5') || model.includes('gpt-4-mini')) {
            return { inputCostPer1k: 0.0005, outputCostPer1k: 0.0015 };
        }
        if (model.includes('gpt-4')) {
            return { inputCostPer1k: 0.03, outputCostPer1k: 0.06 };
        }
        return { inputCostPer1k: 0.01, outputCostPer1k: 0.03 };
    }
}
