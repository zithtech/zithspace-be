import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export const JIRA_QUEUES = {
  INIT: 'jira-migration-init',
  FETCH_ISSUES: 'jira-fetch-issues',
  PROCESS_ISSUE: 'jira-process-issue',
  ATTACHMENTS: 'jira-migrate-attachments'
};

class JiraBullMQService {
  public initQueue: Queue;
  public fetchIssuesQueue: Queue;
  public processIssueQueue: Queue;
  public attachmentsQueue: Queue;

  constructor() {
    this.initQueue = new Queue(JIRA_QUEUES.INIT, { connection });
    this.fetchIssuesQueue = new Queue(JIRA_QUEUES.FETCH_ISSUES, { connection });
    this.processIssueQueue = new Queue(JIRA_QUEUES.PROCESS_ISSUE, { connection });
    this.attachmentsQueue = new Queue(JIRA_QUEUES.ATTACHMENTS, { connection });
  }

  public async enqueueInitMigration(migrationId: string, tenantId: string, integrationId: string, projectKeys: string[], jql: string, statusMapping: any, userMapping: any, migratedBy: string) {
    return await this.initQueue.add('init', {
      migrationId,
      tenantId,
      integrationId,
      projectKeys,
      jql,
      statusMapping,
      userMapping,
      migratedBy
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }
}

export const jiraBullMQService = new JiraBullMQService();
