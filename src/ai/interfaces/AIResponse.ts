export interface AIUsage {
    promptTokens: number;
    completionTokens: number;
}

export interface AIResponse<T> {
    data: T;
    provider: string;
    model: string;
    usage: AIUsage;
    metadata: {
        requestId?: string;
        latency?: number;
        finishReason?: string;
    };
}
