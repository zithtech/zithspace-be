import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: '002-0415' }
  });
  console.log("Ticket details:");
  console.dir(ticket, { depth: null });

  if (ticket) {
    const workEntries = await prisma.work_entry.findMany({
      where: { ticket_id: ticket.id }
    });
    console.log("Work Entries count directly for ticket ID:", workEntries.length);
    console.dir(workEntries, { depth: null });

    const updates = await prisma.statusUpdate.findMany({});
    let matchingUpdates = 0;
    let totalHours = 0;
    updates.forEach(u => {
      let found = false;
      const pu = u.projectUpdates as any[];
      if (Array.isArray(pu)) {
        pu.forEach(p => {
          if (Array.isArray(p.tasks)) {
            p.tasks.forEach((t: any) => {
              if (t.ticketId === ticket.id || t.ticketNumber === ticket.ticketNumber) {
                found = true;
                totalHours += (p.hoursWorked / p.tasks.length);
              }
            });
          }
        });
      }
      if (found) {
        matchingUpdates++;
        console.log(`Update ${u.id} has this ticket. Hours for this update:`, u.totalHoursWorked);
      }
    });

    console.log("Total matching updates:", matchingUpdates);
    console.log("Total hours calculated by script logic:", totalHours);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
