// src/modules/pipeline/types.ts
export interface Actor {
  tenantId: string;
  userId: string;
}

export class PipelineError extends Error {
  constructor(public message: string, public code: string, public statusCode = 400) {
    super(message);
    this.name = 'PipelineError';
  }
}
