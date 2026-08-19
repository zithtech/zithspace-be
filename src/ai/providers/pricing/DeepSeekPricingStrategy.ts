import { ProviderPricingStrategy } from './ProviderPricingStrategy';

export class DeepSeekPricingStrategy implements ProviderPricingStrategy {
    getPricing(model: string): { inputCostPer1k: number; outputCostPer1k: number } {
        // DeepSeek-V3 (deepseek-chat)
        if (model.includes('deepseek-chat') || model.includes('deepseek-v3')) {
            return { inputCostPer1k: 0.00014, outputCostPer1k: 0.00028 };
        }
        // DeepSeek-R1 (reasoning model)
        if (model.includes('deepseek-r1')) {
            return { inputCostPer1k: 0.00055, outputCostPer1k: 0.00219 };
        }
        // DeepSeek-Coder
        if (model.includes('deepseek-coder')) {
            return { inputCostPer1k: 0.00014, outputCostPer1k: 0.00028 };
        }
        // Default fallback for any other DeepSeek model
        return { inputCostPer1k: 0.00014, outputCostPer1k: 0.00028 };
    }
}
