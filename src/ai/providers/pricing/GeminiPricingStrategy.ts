import { ProviderPricingStrategy } from './ProviderPricingStrategy';

export class GeminiPricingStrategy implements ProviderPricingStrategy {
    getPricing(model: string): { inputCostPer1k: number; outputCostPer1k: number } {
        if (model.includes('gemini-1.5-pro')) {
            return { inputCostPer1k: 0.0035, outputCostPer1k: 0.0105 };
        }
        if (model.includes('gemini-1.5-flash')) {
            return { inputCostPer1k: 0.000075, outputCostPer1k: 0.0003 };
        }
        return { inputCostPer1k: 0.0035, outputCostPer1k: 0.0105 };
    }
}
