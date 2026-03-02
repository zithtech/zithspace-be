import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

const makeApiCall = async (
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  token: string,
  tenantId: string,
  data?: any
) => {
  const response = await axios({
    method,
    url: `${API_BASE}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': tenantId,
      'Content-Type': 'application/json',
    },
    data,
  });
  return response.data;
};

/**
 * Get Tickets Tool
 * List tickets with advanced filtering
 */
export const getTicketsTool = createTool({
  id: 'get-tickets',
  description: 'List tickets with filtering by status, priority, assignee, project, and search',
  
  inputSchema: z.object({
    projectId: z.string().optional().describe('Filter by project ID'),
    status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    assigneeId: z.string().optional().describe('Filter by assigned user ID'),
    search: z.string().optional().describe('Search in title and description'),
    page: z.number().optional().default(1),
    limit: z.number().optional().default(10),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    tickets: z.array(z.any()),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
    message: z.string().optional(),
  }),
  
  execute: async (input) => {
    try {
      const { token, tenantId, ...filters } = input;
      
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
      
      const result = await makeApiCall(
        `/tickets?${queryParams.toString()}`,
        'GET',
        token,
        tenantId
      );
      
      return {
        success: true,
        tickets: result.data,
        pagination: result.pagination,
        message: `Found ${result.data.length} tickets`,
      };
    } catch (error: any) {
      return {
        success: false,
        tickets: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        message: error.response?.data?.error || error.message || 'Failed to fetch tickets',
      };
    }
  },
});

/**
 * Get Ticket Details Tool
 */
export const getTicketDetailsTool = createTool({
  id: 'get-ticket-details',
  description: 'Get detailed information about a specific ticket including comments, attachments, and activity',
  
  inputSchema: z.object({
    ticketId: z.string().describe('Ticket ID'),
    includeComments: z.boolean().optional().default(true),
    includeAttachments: z.boolean().optional().default(true),
    includeActivity: z.boolean().optional().default(true),
    includeSubTasks: z.boolean().optional().default(true),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    ticket: z.any().optional(),
    comments: z.array(z.any()).optional(),
    attachments: z.array(z.any()).optional(),
    activity: z.array(z.any()).optional(),
    subTasks: z.array(z.any()).optional(),
    message: z.string().optional(),
  }),
  
  execute: async ({ ticketId, includeComments, includeAttachments, includeActivity, includeSubTasks, token, tenantId }) => {
    try {
      const ticket = await makeApiCall(`/tickets/${ticketId}`, 'GET', token, tenantId);
      
      const result: any = {
        success: true,
        ticket: ticket.data,
      };
      
      // Fetch additional data in parallel
      const promises: Promise<any>[] = [];
      
      if (includeComments) {
        promises.push(
          makeApiCall(`/tickets/${ticketId}/comments`, 'GET', token, tenantId)
            .then(res => ({ comments: res.data }))
        );
      }
      
      if (includeAttachments) {
        promises.push(
          makeApiCall(`/tickets/${ticketId}/attachments`, 'GET', token, tenantId)
            .then(res => ({ attachments: res.data }))
        );
      }
      
      if (includeActivity) {
        promises.push(
          makeApiCall(`/tickets/${ticketId}/activity`, 'GET', token, tenantId)
            .then(res => ({ activity: res.data }))
        );
      }
      
      if (includeSubTasks) {
        promises.push(
          makeApiCall(`/tickets/${ticketId}/sub-tasks`, 'GET', token, tenantId)
            .then(res => ({ subTasks: res.data }))
        );
      }
      
      const additionalData = await Promise.all(promises);
      additionalData.forEach(data => Object.assign(result, data));
      
      result.message = `Retrieved details for ticket: ${ticket.data.title}`;
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to fetch ticket details',
      };
    }
  },
});

/**
 * Create Ticket Tool
 */
export const createTicketTool = createTool({
  id: 'create-ticket',
  description: 'Create a new ticket. Always confirm with user before executing.',
  
  inputSchema: z.object({
    title: z.string().describe('Ticket title'),
    description: z.string().describe('Ticket description'),
    projectId: z.string().describe('Project ID'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).default('BACKLOG'),
    assigneeId: z.string().optional().describe('Assigned user ID'),
    taskType: z.enum(['TASK', 'BUG', 'FEATURE', 'EPIC', 'STORY']).default('TASK'),
    taskLevel: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    storyPoints: z.number().optional(),
    estimateHours: z.number().optional(),
    parentId: z.string().optional().describe('Parent ticket ID for sub-tasks'),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    ticket: z.any().optional(),
    message: z.string(),
  }),
  
  execute: async (input) => {
    try {
      const { token, tenantId, ...ticketData } = input;
      
      const result = await makeApiCall(
        '/tickets',
        'POST',
        token,
        tenantId,
        ticketData
      );
      
      return {
        success: true,
        ticket: result.data,
        message: `Ticket "${result.data.title}" created successfully with ID: ${result.data.id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to create ticket',
      };
    }
  },
});

/**
 * Update Ticket Tool
 */
export const updateTicketTool = createTool({
  id: 'update-ticket',
  description: 'Update an existing ticket',
  
  inputSchema: z.object({
    ticketId: z.string().describe('Ticket ID'),
    status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    assigneeId: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    ticket: z.any().optional(),
    message: z.string(),
  }),
  
  execute: async (input) => {
    try {
      const { ticketId, token, tenantId, ...updates } = input;
      
      const result = await makeApiCall(
        `/tickets/${ticketId}`,
        'PUT',
        token,
        tenantId,
        updates
      );
      
      return {
        success: true,
        ticket: result.data,
        message: `Ticket updated successfully`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to update ticket',
      };
    }
  },
});

/**
 * Get My Tickets Tool
 */
export const getMyTicketsTool = createTool({
  id: 'get-my-tickets',
  description: 'Get tickets assigned to the current user',
  
  inputSchema: z.object({
    status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    page: z.number().optional().default(1),
    limit: z.number().optional().default(10),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    tickets: z.array(z.any()),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
    message: z.string().optional(),
  }),
  
  execute: async (input) => {
    try {
      const { token, tenantId, ...filters } = input;
      
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
      
      const result = await makeApiCall(
        `/tickets/my?${queryParams.toString()}`,
        'GET',
        token,
        tenantId
      );
      
      return {
        success: true,
        tickets: result.data,
        pagination: result.pagination,
        message: `Found ${result.data.length} tickets assigned to you`,
      };
    } catch (error: any) {
      return {
        success: false,
        tickets: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        message: error.response?.data?.error || error.message || 'Failed to fetch your tickets',
      };
    }
  },
});

// Export all ticket tools
export const ticketTools = {
  getTicketsTool,
  getTicketDetailsTool,
  createTicketTool,
  updateTicketTool,
  getMyTicketsTool,
};
