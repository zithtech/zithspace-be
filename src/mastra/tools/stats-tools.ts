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
 * Get Dashboard Stats Tool
 */
export const getDashboardStatsTool = createTool({
  id: 'get-dashboard-stats',
  description: 'Get dashboard statistics including ticket counts, project summaries, and trends',
  
  inputSchema: z.object({
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.any().optional(),
    message: z.string().optional(),
  }),
  
  execute: async ({ token, tenantId }) => {
    try {
      const result = await makeApiCall(
        '/tickets/dashboard/stats',
        'GET',
        token,
        tenantId
      );
      
      return {
        success: true,
        stats: result.data,
        message: 'Dashboard statistics retrieved successfully',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to fetch dashboard stats',
      };
    }
  },
});

/**
 * Get Project Stats Tool
 */
export const getProjectStatsTool = createTool({
  id: 'get-project-stats',
  description: 'Get detailed statistics for a specific project',
  
  inputSchema: z.object({
    projectId: z.string().describe('Project ID'),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.any().optional(),
    message: z.string().optional(),
  }),
  
  execute: async ({ projectId, token, tenantId }) => {
    try {
      const result = await makeApiCall(
        `/projects/${projectId}/stats`,
        'GET',
        token,
        tenantId
      );
      
      return {
        success: true,
        stats: result.data,
        message: 'Project statistics retrieved successfully',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to fetch project stats',
      };
    }
  },
});

// Export all stats tools
export const statsTools = {
  getDashboardStatsTool,
  getProjectStatsTool,
};
