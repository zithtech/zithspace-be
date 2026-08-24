import { Queue } from 'bullmq';

export function buildConnection() {
  const base = { maxRetriesPerRequest: null as null };
  const url = process.env.REDIS_URL;
  if (url) {
    const u = new URL(url);
    return {
      ...base,
      host: u.hostname,
      port: parseInt(u.port || '6379'),
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    };
  }
  return {
    ...base,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export const connection = buildConnection();

export const LINEAR_QUEUES = {
  INIT: 'linear-migration-init',
  FETCH_ISSUES: 'linear-fetch-issues',
  PROCESS_ISSUE: 'linear-process-issue',
  ATTACHMENTS: 'linear-migrate-attachments'
};

class LinearBullMQService {
  public initQueue: Queue;
  public fetchIssuesQueue: Queue;
  public processIssueQueue: Queue;
  public attachmentsQueue: Queue;

  constructor() {
    this.initQueue = new Queue(LINEAR_QUEUES.INIT, { connection });
    this.fetchIssuesQueue = new Queue(LINEAR_QUEUES.FETCH_ISSUES, { connection });
    this.processIssueQueue = new Queue(LINEAR_QUEUES.PROCESS_ISSUE, { connection });
    this.attachmentsQueue = new Queue(LINEAR_QUEUES.ATTACHMENTS, { connection });
  }

  public async enqueueInitMigration(
    migrationId: string,
    tenantId: string,
    integrationId: string,
    projectIds: string[],
    teamIds: string[],
    cycleIds: string[],
    stateIds: string[],
    userIds: string[],
    statusMapping: Record<string, string>,
    userMapping: Record<string, string>,
    migratedBy: string
  ) {
    return await this.initQueue.add('init', {
      migrationId,
      tenantId,
      integrationId,
      projectIds,
      teamIds,
      cycleIds,
      stateIds,
      userIds,
      statusMapping,
      userMapping,
      migratedBy
    });
  }
}

export const linearBullMQService = new LinearBullMQService();
