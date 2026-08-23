export interface PricingResult {
    credits: number;
    providerCost: number;
    conversionRate: number;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    aiRequestId?: string;
}
