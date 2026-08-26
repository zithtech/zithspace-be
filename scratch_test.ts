import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: 'TKT-0265' }
  });
  console.log("Ticket TKT-0265:", JSON.stringify(ticket, null, 2));

  if (ticket) {
    const projectStats = await prisma.ticket.groupBy({
      by: ["projectId"],
      where: {
        tenantId: ticket.tenantId,
        isDeleted: false,
        isArchived: true,
      },
      _count: true,
    });
    console.log("projectArchivedStats for tenant:", JSON.stringify(projectStats, null, 2));
    
    // Check if _count is an object or number
    console.log("_count type:", typeof projectStats[0]?._count);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
