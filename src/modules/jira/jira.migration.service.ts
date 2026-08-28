import * as amqplib from "amqplib";
import { JiraMappingService } from "./jira.mapping.service";
import { JiraApiService } from "./jira.api.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const QUEUE_NAME = "jira_migration_queue";

export class JiraMigrationService {
  private mappingService: JiraMappingService;
  private apiService: JiraApiService;

  constructor() {
    this.mappingService = new JiraMappingService();
    this.apiService = new JiraApiService();
  }

  /**
   * Initializes RabbitMQ channel and consumer.
   */
  public async initWorker() {
    try {
      const rabbitUrl = process.env.RABBITMQ_URL || "amqp://localhost";
      const connection = await amqplib.connect(rabbitUrl);
      const channel = await connection.createChannel();
      
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      console.log(`[*] Waiting for messages in ${QUEUE_NAME}.`);

      channel.consume(QUEUE_NAME, async (msg) => {
        if (msg !== null) {
          try {
            const data = JSON.parse(msg.content.toString());
            await this.processMigrationJob(data);
            channel.ack(msg);
          } catch (error) {
            console.error("Failed to process migration job", error);
            // Requeue or DLQ in a real app
            channel.ack(msg); 
          }
        }
      });
    } catch (error) {
      console.error("Failed to connect to RabbitMQ", error);
    }
  }

  /**
   * Enqueues a new migration job.
   */
  public async enqueueMigrationJob(
    tenantId: string,
    integrationId: string,
    projectKeys: string[]
  ) {
    const rabbitUrl = process.env.RABBITMQ_URL || "amqp://localhost";
    const connection = await amqplib.connect(rabbitUrl);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Create job record using raw query
    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "jira_migration_jobs" (
        "tenant_id",
        "jira_integration_id",
        "status",
        "total_projects"
      ) VALUES (
        ${tenantId}::uuid,
        ${integrationId}::uuid,
        'RUNNING',
        ${projectKeys.length}
      )
      RETURNING id;
    `;

    const jobId = result[0].id;

    const msg = JSON.stringify({
      jobId,
      tenantId,
      integrationId,
      projectKeys
    });

    channel.sendToQueue(QUEUE_NAME, Buffer.from(msg), { persistent: true });
    await channel.close();
    await connection.close();

    return jobId;
  }

  /**
   * Processes the migration job (The Core Import Logic).
   */
  private async processMigrationJob(data: any) {
    const { jobId, tenantId, integrationId, projectKeys } = data;
    console.log(`Processing Migration Job ${jobId} for Tenant ${tenantId}`);

    // In a real scenario, we would use the apiService to fetch data
    // from Jira, map it, and insert into Zukvo using mappingService
    // to check idempotency.

    // Mock completion
    await prisma.$executeRaw`
      UPDATE "jira_migration_jobs"
      SET "status" = 'COMPLETED',
          "processed_projects" = ${projectKeys.length},
          "completed_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${jobId}::uuid;
    `;

    console.log(`Migration Job ${jobId} completed.`);
  }
}
