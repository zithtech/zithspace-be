import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class JiraMappingService {
  /**
   * Finds an existing Zukvo ID mapped to a Jira ID.
   * Useful for idempotency.
   */
  public async getZukvoId(
    tenantId: string,
    integrationId: string,
    entityType: string,
    jiraId: string
  ): Promise<string | null> {
    const result = await prisma.$queryRaw<Array<{ zukvo_id: string }>>`
      SELECT "zukvo_id"
      FROM "jira_entity_mappings"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "jira_integration_id" = ${integrationId}::uuid
        AND "entity_type" = ${entityType}
        AND "jira_id" = ${jiraId}
      LIMIT 1;
    `;

    return result.length > 0 ? result[0].zukvo_id : null;
  }

  /**
   * Saves a new mapping between a Jira ID and a Zukvo ID.
   */
  public async saveMapping(
    tenantId: string,
    integrationId: string,
    entityType: string,
    jiraId: string,
    zukvoId: string
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "jira_entity_mappings" (
        "tenant_id",
        "jira_integration_id",
        "entity_type",
        "jira_id",
        "zukvo_id"
      ) VALUES (
        ${tenantId}::uuid,
        ${integrationId}::uuid,
        ${entityType},
        ${jiraId},
        ${zukvoId}
      )
      ON CONFLICT ("jira_integration_id", "entity_type", "jira_id")
      DO NOTHING;
    `;
  }
}
