import { PricingConfigService } from './PricingConfigService';

export class CreditCalculator {
    static async calculateCredits(providerCost: number): Promise<{ credits: number, conversionRate: number }> {
        const conversionRate = await PricingConfigService.getConversionRate();
        const minCredit = await PricingConfigService.getMinimumCredit();
        const rounding = await PricingConfigService.getRoundingStrategy();

        const rawCredits = providerCost / conversionRate;
        
        let roundedCredits = rawCredits;
        if (rounding === 'CEIL') {
            roundedCredits = Math.ceil(rawCredits);
        } else if (rounding === 'FLOOR') {
            roundedCredits = Math.floor(rawCredits);
        } else if (rounding === 'ROUND') {
            roundedCredits = Math.round(rawCredits);
        }

        const finalCredits = Math.max(roundedCredits, minCredit);
        
        return { credits: finalCredits, conversionRate };
    }
}
