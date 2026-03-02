import { Mastra } from '@mastra/core';
import { PostgresEngine } from '@mastra/engine';
import { projectAssistantAgent } from './agent/project-assistant';

/**
 * Get Mastra database URL
 * Uses MASTRA_DATABASE_URL for a separate database, or falls back to main DATABASE_URL
 */
const getMastraDatabaseUrl = (): string => {
  // Priority 1: Dedicated Mastra database URL (recommended for production)
  if (process.env.MASTRA_DATABASE_URL) {
    console.log('✅ Using dedicated Mastra database (MASTRA_DATABASE_URL)');
    return process.env.MASTRA_DATABASE_URL;
  }

  // Priority 2: Main application database URL
  if (process.env.DATABASE_URL) {
    console.log('⚠️  Using main application database for Mastra (DATABASE_URL)');
    return process.env.DATABASE_URL;
  }

  // Priority 3: Construct from individual variables
  const constructedUrl = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  console.log('⚠️  Using main application database for Mastra (constructed from DB_* variables)');
  return constructedUrl;
};

// Initialize PostgreSQL engine for agent memory with dedicated database
const engine = new PostgresEngine({
  url: getMastraDatabaseUrl(),
});

// Create Mastra instance with agent
export const mastra = new Mastra({
  agents: {
    projectAssistant: projectAssistantAgent,
  },
  engine,
  systemLogger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    type: 'CONSOLE',
  },
});

// Export agent accessor
export const getProjectAssistant = () => mastra.getAgent('projectAssistant');

// Initialize Mastra (run migrations, etc.)
export const initializeMastra = async () => {
  try {
    console.log('Initializing Mastra...');
    // Engine will auto-initialize on first use
    console.log('Mastra initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Mastra:', error);
    throw error;
  }
};
