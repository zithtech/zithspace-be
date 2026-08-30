import { ProviderPricingStrategy } from './ProviderPricingStrategy';
import { OpenAIPricingStrategy } from './OpenAIPricingStrategy';
import { GeminiPricingStrategy } from './GeminiPricingStrategy';
import { DeepSeekPricingStrategy } from './DeepSeekPricingStrategy';
import { MockPricingStrategy } from './MockPricingStrategy';

export class PricingStrategyFactory {
    static getStrategy(provider: string): ProviderPricingStrategy {
        const lowerProvider = provider.toLowerCase();
        if (lowerProvider === 'openai') {
            return new OpenAIPricingStrategy();
        }
        if (lowerProvider === 'gemini' || lowerProvider === 'google') {
            return new GeminiPricingStrategy();
        }
        if (lowerProvider === 'deepseek') {
            return new DeepSeekPricingStrategy();
        }
        if (lowerProvider === 'mock') {
            return new MockPricingStrategy();
        }
        throw new Error(`No pricing strategy found for provider: ${provider}`);
    }
}
