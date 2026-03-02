import { Response } from 'express';
import { AuthRequest, ApiResponse } from '@/types';
import { getProjectAssistant } from '../mastra';

export class AgentController {
  /**
   * Chat with Project Assistant Agent
   * Handles streaming and non-streaming responses
   */
  static async chat(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { message, stream = false, threadId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Message is required',
        } as ApiResponse);
        return;
      }

      // Get agent instance
      const agent = getProjectAssistant();

      // Extract token from authorization header
      const token = req.headers.authorization?.replace('Bearer ', '') || '';

      // Prepare context variables that will be injected into tool executions
      const context = {
        token,
        tenantId: req.tenantId,
        userId: req.user.id,
      };

      // Build messages array
      const messages = [
        {
          role: 'user' as const,
          content: message,
        },
      ];

      const resourceId = threadId || `user-${req.user.id}`;

      if (stream) {
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

        try {
          // Inject context into each message for tool access
          const messagesWithContext = messages.map(msg => ({
            ...msg,
            experimental_providerMetadata: context,
          }));

          // Stream response
          const streamResponse = await agent.generate(messagesWithContext, {
            resourceId,
            onStepFinish: ({ toolCalls }) => {
              // Send tool call updates via SSE
              if (toolCalls && toolCalls.length > 0) {
                res.write(`data: ${JSON.stringify({
                  type: 'tool_call',
                  tools: toolCalls.map(tc => tc.toolName)
                })}\n\n`);
              }
            },
          });

          // Stream text
          const text = streamResponse.text || '';
          // Split into chunks for smoother streaming
          const chunks = text.match(/.{1,50}/g) || [text];
          
          for (const chunk of chunks) {
            res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            // Small delay for better streaming effect
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Send completion
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
        } catch (streamError) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: streamError instanceof Error ? streamError.message : 'Stream error'
          })}\n\n`);
          res.end();
        }
      } else {
        // Non-streaming response
        const messagesWithContext = messages.map(msg => ({
          ...msg,
          experimental_providerMetadata: context,
        }));

        const response = await agent.generate(messagesWithContext, {
          resourceId,
        });

        res.status(200).json({
          success: true,
          data: {
            message: response.text,
            threadId: resourceId,
            steps: response.steps?.length || 0,
          },
        } as ApiResponse);
      }
    } catch (error) {
      console.error('Agent chat error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process chat',
        } as ApiResponse);
      }
    }
  }

  /**
   * Get agent conversation history
   */
  static async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { threadId } = req.params;
      const resourceId = threadId || `user-${req.user.id}`;

      // Get agent instance
      const agent = getProjectAssistant();

      // Get thread history from memory
      const history = await agent.memory?.getThread({ resourceId });

      res.status(200).json({
        success: true,
        data: {
          threadId: resourceId,
          messages: history?.messages || [],
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get history error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get history',
      } as ApiResponse);
    }
  }

  /**
   * Clear conversation history
   */
  static async clearHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const { threadId } = req.params;
      const resourceId = threadId || `user-${req.user.id}`;

      // Get agent instance
      const agent = getProjectAssistant();

      // Delete thread
      await agent.memory?.deleteThread({ resourceId });

      res.status(200).json({
        success: true,
        data: {
          message: 'Conversation history cleared',
          threadId: resourceId,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Clear history error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear history',
      } as ApiResponse);
    }
  }
}
