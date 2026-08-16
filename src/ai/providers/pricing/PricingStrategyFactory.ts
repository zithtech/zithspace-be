import { ProviderPricingStrategy } from './ProviderPricingStrategy';
import { OpenAIPricingStrategy } from './OpenAIPricingStrategy';
import { GeminiPricingStrategy } from './GeminiPricingStrategy';

export class PricingStrategyFactory {
    static getStrategy(provider: string): ProviderPricingStrategy {
        const lowerProvider = provider.toLowerCase();
        if (lowerProvider === 'openai') {
            return new OpenAIPricingStrategy();
        }
        if (lowerProvider === 'gemini' || lowerProvider === 'google') {
            return new GeminiPricingStrategy();
        }
        throw new Error(`No pricing strategy found for provider: ${provider}`);
    }
}
