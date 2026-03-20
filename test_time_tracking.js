const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const entries = await prisma.timeTrackingEntry.findMany();
    console.log("SUCCESS:", entries);
  } catch (error) {
    console.error("ERROR:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
