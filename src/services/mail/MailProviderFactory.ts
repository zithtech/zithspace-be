import { mail_provider } from "@prisma/client";
import { IMailProvider } from "./IMailProvider";
import { GoogleMailProvider } from "./providers/GoogleMailProvider";
import { MicrosoftMailProvider } from "./providers/MicrosoftMailProvider";
import { ZohoMailProvider } from "./providers/ZohoMailProvider";

export class MailProviderFactory {
    private static providers: Map<mail_provider, IMailProvider> = new Map();

    static getProvider(provider: mail_provider): IMailProvider {
        if (!this.providers.has(provider)) {
            switch (provider) {
                case mail_provider.GOOGLE:
                    this.providers.set(provider, new GoogleMailProvider());
                    break;
                case mail_provider.MICROSOFT:
                    this.providers.set(provider, new MicrosoftMailProvider());
                    break;
                case mail_provider.ZOHO:
                    this.providers.set(provider, new ZohoMailProvider());
                    break;
                default:
                    throw new Error(`Mail provider ${provider} not supported`);
            }
        }
        return this.providers.get(provider)!;
    }
}
