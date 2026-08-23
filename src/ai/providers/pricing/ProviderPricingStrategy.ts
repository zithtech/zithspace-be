export interface ProviderPricingStrategy {
    getPricing(model: string): { inputCostPer1k: number; outputCostPer1k: number };
}
