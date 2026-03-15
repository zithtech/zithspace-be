const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLabels() {
    try {
        const threadCounts = await prisma.mailThread.groupBy({
            by: ['labels'],
            _count: {
                id: true
            }
        });
        console.log('Thread Label Counts:', JSON.stringify(threadCounts, null, 2));

        const messageCounts = await prisma.mailMessage.groupBy({
            by: ['labels'],
            _count: {
                id: true
            }
        });
        console.log('Message Label Counts:', JSON.stringify(messageCounts, null, 2));

        const sentThreads = await prisma.mailThread.findMany({
            where: { labels: { has: 'SENT' } },
            take: 5
        });
        console.log('Sample SENT threads:', JSON.stringify(sentThreads, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkLabels();
