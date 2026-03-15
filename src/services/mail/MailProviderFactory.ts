import { MailProvider } from "@prisma/client";
import { IMailProvider } from "./IMailProvider";
import { GoogleMailProvider } from "./providers/GoogleMailProvider";
import { MicrosoftMailProvider } from "./providers/MicrosoftMailProvider";
import { ZohoMailProvider } from "./providers/ZohoMailProvider";

export class MailProviderFactory {
    private static providers: Map<MailProvider, IMailProvider> = new Map();

    static getProvider(provider: MailProvider): IMailProvider {
        if (!this.providers.has(provider)) {
            switch (provider) {
                case MailProvider.GOOGLE:
                    this.providers.set(provider, new GoogleMailProvider());
                    break;
                case MailProvider.MICROSOFT:
                    this.providers.set(provider, new MicrosoftMailProvider());
                    break;
                case MailProvider.ZOHO:
                    this.providers.set(provider, new ZohoMailProvider());
                    break;
                default:
                    throw new Error(`Mail provider ${provider} not supported`);
            }
        }
        return this.providers.get(provider)!;
    }
}
