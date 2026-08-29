import { ProviderPricingStrategy } from './ProviderPricingStrategy';

export class MockPricingStrategy implements ProviderPricingStrategy {
    getPricing(model: string): { inputCostPer1k: number; outputCostPer1k: number } {
        return { inputCostPer1k: 0, outputCostPer1k: 0 };
    }
}
