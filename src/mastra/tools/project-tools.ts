import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

// Base URL for internal API calls
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

/**
 * Helper to make authenticated API calls
 */
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
 * Get Projects Tool
 * Lists projects with optional filtering
 */
export const getProjectsTool = createTool({
  id: 'get-projects',
  description: 'List projects with optional search, status filter, and pagination',
  
  inputSchema: z.object({
    search: z.string().optional().describe('Search term for project name, description, or code'),
    status: z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'ARCHIVED']).optional().describe('Filter by project status'),
    page: z.number().optional().default(1).describe('Page number for pagination'),
    limit: z.number().optional().default(10).describe('Number of results per page'),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    projects: z.array(z.any()),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
    message: z.string().optional(),
  }),
  
  execute: async ({ search, status, page, limit, token, tenantId }) => {
    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (status) queryParams.append('status', status);
      queryParams.append('page', page.toString());
      queryParams.append('limit', limit.toString());
      
      const result = await makeApiCall(
        `/projects?${queryParams.toString()}`,
        'GET',
        token,
        tenantId
      );
      
      return {
        success: true,
        projects: result.data,
        pagination: result.pagination,
        message: `Found ${result.data.length} projects`,
      };
    } catch (error: any) {
      return {
        success: false,
        projects: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        message: error.response?.data?.error || error.message || 'Failed to fetch projects',
      };
    }
  },
});

/**
 * Get Project Details Tool
 * Get detailed information about a specific project
 */
export const getProjectDetailsTool = createTool({
  id: 'get-project-details',
  description: 'Get detailed information about a specific project including members, stats, and tickets',
  
  inputSchema: z.object({
    projectId: z.string().describe('Project ID'),
    includeStats: z.boolean().optional().default(true).describe('Include project statistics'),
    includeTickets: z.boolean().optional().default(false).describe('Include project tickets'),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    project: z.any().optional(),
    stats: z.any().optional(),
    tickets: z.array(z.any()).optional(),
    message: z.string().optional(),
  }),
  
  execute: async ({ projectId, includeStats, includeTickets, token, tenantId }) => {
    try {
      const project = await makeApiCall(`/projects/${projectId}`, 'GET', token, tenantId);
      
      const result: any = {
        success: true,
        project: project.data,
      };
      
      if (includeStats) {
        const stats = await makeApiCall(`/projects/${projectId}/stats`, 'GET', token, tenantId);
        result.stats = stats.data;
      }
      
      if (includeTickets) {
        const tickets = await makeApiCall(`/projects/${projectId}/tickets`, 'GET', token, tenantId);
        result.tickets = tickets.data;
      }
      
      result.message = `Retrieved details for project: ${project.data.name}`;
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to fetch project details',
      };
    }
  },
});

/**
 * Create Project Tool
 * Create a new project (requires confirmation from user)
 */
export const createProjectTool = createTool({
  id: 'create-project',
  description: 'Create a new project. Always confirm with user before executing this tool.',
  
  inputSchema: z.object({
    name: z.string().describe('Project name'),
    code: z.string().optional().describe('Project code (auto-generated if not provided)'),
    description: z.string().optional().describe('Project description'),
    status: z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'ARCHIVED']).default('ACTIVE'),
    startDate: z.string().optional().describe('Project start date (ISO format)'),
    endDate: z.string().optional().describe('Project end date (ISO format)'),
    projectManagerId: z.string().optional().describe('Project manager user ID'),
    clientId: z.string().optional().describe('Client ID'),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    project: z.any().optional(),
    message: z.string(),
  }),
  
  execute: async (input) => {
    try {
      const { token, tenantId, ...projectData } = input;
      
      const result = await makeApiCall(
        '/projects',
        'POST',
        token,
        tenantId,
        projectData
      );
      
      return {
        success: true,
        project: result.data,
        message: `Project "${result.data.name}" created successfully with ID: ${result.data.id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.error || error.message || 'Failed to create project',
      };
    }
  },
});

/**
 * Get Project Members Tool
 */
export const getProjectMembersTool = createTool({
  id: 'get-project-members',
  description: 'Get list of members assigned to a project',
  
  inputSchema: z.object({
    projectId: z.string().describe('Project ID'),
    token: z.string().describe('User authentication token'),
    tenantId: z.string().describe('Tenant ID'),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    members: z.array(z.any()),
    message: z.string().optional(),
  }),
  
  execute: async ({ projectId, token, tenantId }) => {
    try {
      const result = await makeApiCall(
        `/projects/${projectId}/members`,
        'GET',
        token,
        tenantId
      );
      
      return {
        success: true,
        members: result.data,
        message: `Found ${result.data.length} members in project`,
      };
    } catch (error: any) {
      return {
        success: false,
        members: [],
        message: error.response?.data?.error || error.message || 'Failed to fetch project members',
      };
    }
  },
});

// Export all project tools
export const projectTools = {
  getProjectsTool,
  getProjectDetailsTool,
  createProjectTool,
  getProjectMembersTool,
};
