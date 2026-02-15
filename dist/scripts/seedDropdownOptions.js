"use strict";
/**
 * Seed Dropdown Options Script
 * Inserts default ticket dropdown configurations from hardcoded values
 * into the dropdown_options table for all tenants
 *
 * Usage: npx ts-node src/scripts/seedDropdownOptions.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Dropdown data extracted from settingsController.ts hardcoded values
const DROPDOWN_DATA = {
    priority: [
        { value: 'P1', label: 'High (P1)', color: '#ff4d4f', description: 'Critical priority', order: 1 },
        { value: 'P2', label: 'Medium (P2)', color: '#fa8c16', description: 'Medium priority', order: 2 },
        { value: 'P3', label: 'Lite (P3)', color: '#52c41a', description: 'Low priority', order: 3 }
    ],
    taskType: [
        { value: 'Bug', label: 'Bug', color: '#ff4d4f', description: 'Bug fix', order: 1 },
        { value: 'Task', label: 'Task', color: '#1890ff', description: 'General task', order: 2 },
        { value: 'Feat', label: 'Feature', color: '#52c41a', description: 'New feature', order: 3 },
        { value: 'Enhancement', label: 'Enhancement', color: '#722ed1', description: 'Enhancement', order: 4 }
    ],
    status: [
        { value: 'not_started', label: 'Not Started', color: '#d9d9d9', description: 'Task not started', order: 1 },
        { value: 'in_progress', label: 'In Progress', color: '#1890ff', description: 'Task in progress', order: 2 },
        { value: 'dev_complete', label: 'Dev Complete', color: '#2db7f5', description: 'Development completed', order: 3 },
        { value: 'in_testing', label: 'Testing', color: '#fa8c16', description: 'In testing phase', order: 4 },
        { value: 'in_review', label: 'In Review', color: '#722ed1', description: 'Under review', order: 5 },
        { value: 'completed', label: 'Completed', color: '#52c41a', description: 'Task completed', order: 6 },
        { value: 'live', label: 'Live', color: '#0050b3', description: 'Deployed to production', order: 7 }
    ],
    platform: [
        { value: 'Development', label: 'Development', color: '#1890ff', description: 'Software development tasks', order: 1 },
        { value: 'UI/UX', label: 'UI/UX', color: '#722ed1', description: 'User interface and experience design', order: 2 },
        { value: 'PM', label: 'PM', color: '#fa8c16', description: 'Project management tasks', order: 3 },
        { value: 'Business Team', label: 'Business Team', color: '#52c41a', description: 'Business analysis and requirements', order: 4 },
        { value: 'DevOps', label: 'DevOps', color: '#eb2f96', description: 'DevOps and infrastructure', order: 5 },
        { value: 'Testing', label: 'Testing', color: '#13c2c2', description: 'Quality assurance and testing', order: 6 }
    ],
    stack: [
        { value: 'Front End', label: 'Front End', color: '#1890ff', description: 'Frontend development', order: 1 },
        { value: 'Back End', label: 'Back End', color: '#52c41a', description: 'Backend development', order: 2 },
        { value: 'Full Stack', label: 'Full Stack', color: '#722ed1', description: 'Full stack development', order: 3 }
    ],
    taskLevel: [
        { value: 'Easy', label: 'Easy', color: '#52c41a', description: 'Simple task', order: 1 },
        { value: 'Lite', label: 'Lite', color: '#1890ff', description: 'Light complexity', order: 2 },
        { value: 'Medium', label: 'Medium', color: '#fa8c16', description: 'Medium complexity', order: 3 },
        { value: 'Hard', label: 'Hard', color: '#ff4d4f', description: 'High complexity', order: 4 }
    ]
};
async function seedDropdownOptions() {
    console.log('🌱 Starting Dropdown Options Seed...\n');
    try {
        // ==========================================
        // 1. GET ALL TENANTS
        // ==========================================
        console.log('📋 Fetching all tenants...');
        const tenants = await prisma.tenant.findMany({
            where: { isActive: true },
            select: { id: true, name: true, subdomain: true }
        });
        if (tenants.length === 0) {
            console.log('⚠️  No tenants found. Please run the main seed script first.');
            console.log('   Command: npm run seed\n');
            return;
        }
        console.log(`✅ Found ${tenants.length} tenant(s)\n`);
        // ==========================================
        // 2. SEED DROPDOWN OPTIONS FOR EACH TENANT
        // ==========================================
        let totalInserted = 0;
        let totalSkipped = 0;
        for (const tenant of tenants) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📦 Processing Tenant: ${tenant.name} (${tenant.subdomain})`);
            console.log(`${'='.repeat(60)}`);
            for (const [category, options] of Object.entries(DROPDOWN_DATA)) {
                console.log(`\n  📝 Category: ${category}`);
                for (const option of options) {
                    try {
                        // Check if option already exists
                        const existing = await prisma.dropdownOption.findFirst({
                            where: {
                                tenantId: tenant.id,
                                category: category,
                                value: option.value
                            }
                        });
                        if (existing) {
                            console.log(`     ⏭️  Skipped: ${option.label} (already exists)`);
                            totalSkipped++;
                            continue;
                        }
                        // Create new dropdown option
                        await prisma.dropdownOption.create({
                            data: {
                                tenantId: tenant.id,
                                category: category,
                                value: option.value,
                                label: option.label,
                                order: option.order,
                                isActive: true,
                                // Note: color and description are stored in label or can be added to schema
                            }
                        });
                        console.log(`     ✅ Inserted: ${option.label}`);
                        totalInserted++;
                    }
                    catch (error) {
                        console.error(`     ❌ Error inserting ${option.label}:`, error);
                    }
                }
            }
        }
        // ==========================================
        // 3. SUMMARY
        // ==========================================
        console.log('\n' + '='.repeat(60));
        console.log('🎉 Dropdown Options Seed Completed!\n');
        console.log('📊 Summary:');
        console.log(`  Tenants Processed: ${tenants.length}`);
        console.log(`  Options Inserted: ${totalInserted}`);
        console.log(`  Options Skipped: ${totalSkipped}`);
        console.log(`  Total Categories: ${Object.keys(DROPDOWN_DATA).length}`);
        console.log('='.repeat(60) + '\n');
        console.log('💡 Next Steps:');
        console.log('  1. Verify data in database: SELECT * FROM dropdown_options;');
        console.log('  2. Update getTicketConfigurations() to query dropdown_options table');
        console.log('  3. Test the dropdown options in ticket creation form\n');
    }
    catch (error) {
        console.error('❌ Error seeding dropdown options:', error);
        throw error;
    }
}
// Execute the seed function
seedDropdownOptions()
    .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seedDropdownOptions.js.map