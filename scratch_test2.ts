import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
  
  const projectArchivedStats = await prisma.ticket.groupBy({
    by: ["projectId"],
    where: {
      tenantId,
      isDeleted: false,
      isArchived: true,
    },
    _count: true,
  });

  const projectStatsMap = new Map();
  
  projectArchivedStats.forEach((stat) => {
    if (!projectStatsMap.has(stat.projectId)) {
      projectStatsMap.set(stat.projectId, { statuses: [], archivedCount: 0 });
    }
    projectStatsMap.get(stat.projectId).archivedCount = stat._count;
  });

  const projectStats = Array.from(projectStatsMap.entries()).map(([id, data]) => ({
    id,
    statuses: data.statuses,
    archivedCount: data.archivedCount,
  }));

  console.log("projectStats:", JSON.stringify(projectStats, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
