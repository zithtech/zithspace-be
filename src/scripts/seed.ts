/**
 * Database Seed Script
 * Creates default tenant and admin user for development
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Default tenant configuration (matches frontend devSetup.ts)
const DEFAULT_TENANT = {
  id: 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d',
  name: 'Zithmi',
  subdomain: 'zithmi',
  planType: 'enterprise',
  maxUsers: 50,
  isActive: true,
  settings: {},
};

// Default admin user configuration (matches frontend devSetup.ts)
const DEFAULT_ADMIN = {
  name: 'Admin User',
  workEmail: 'admin@zithmi.com',
  personalEmail: 'admin.personal@zithmi.com',
  phone: '+91-9999999999',
  password: 'admin123',
  role: 'admin',
  position: 'System Administrator',
  isActive: true,
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
};

async function main() {
  console.log('🌱 Starting database seed...\n');

  try {
    // ==========================================
    // 1. CREATE DEFAULT TENANT
    // ==========================================
    console.log('📋 Checking for default tenant...');
    
    let tenant = await prisma.tenant.findUnique({
      where: { id: DEFAULT_TENANT.id },
    });

    if (tenant) {
      console.log('✅ Tenant already exists:', tenant.name);
    } else {
      tenant = await prisma.tenant.create({
        data: {
          id: DEFAULT_TENANT.id,
          name: DEFAULT_TENANT.name,
          subdomain: DEFAULT_TENANT.subdomain,
          planType: DEFAULT_TENANT.planType,
          maxUsers: DEFAULT_TENANT.maxUsers,
          isActive: DEFAULT_TENANT.isActive,
          settings: DEFAULT_TENANT.settings,
        },
      });
      console.log('✅ Tenant created:', tenant.name);
    }

    // ==========================================
    // 2. CREATE DEFAULT ADMIN USER
    // ==========================================
    console.log('\n📋 Checking for admin user...');
    
    let adminUser = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        workEmail: DEFAULT_ADMIN.workEmail,
      },
    });

    if (adminUser) {
      console.log('✅ Admin user already exists:', adminUser.workEmail);
    } else {
      // Hash the password
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 12);

      adminUser = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          name: DEFAULT_ADMIN.name,
          workEmail: DEFAULT_ADMIN.workEmail,
          personalEmail: DEFAULT_ADMIN.personalEmail,
          phone: DEFAULT_ADMIN.phone,
          passwordHash: passwordHash,
          role: DEFAULT_ADMIN.role,
          position: DEFAULT_ADMIN.position,
          isActive: DEFAULT_ADMIN.isActive,
          workDays: DEFAULT_ADMIN.workDays,
        },
      });
      console.log('✅ Admin user created:', adminUser.workEmail);
    }

    // ==========================================
    // 3. SUMMARY
    // ==========================================
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Database seed completed successfully!\n');
    console.log('📊 Summary:');
    console.log('  Tenant ID:', tenant.id);
    console.log('  Tenant Name:', tenant.name);
    console.log('  Subdomain:', tenant.subdomain);
    console.log('  Plan Type:', tenant.planType);
    console.log('\n  Admin Email:', adminUser.workEmail);
    console.log('  Admin Password:', DEFAULT_ADMIN.password);
    console.log('  Admin Role:', adminUser.role);
    console.log('='.repeat(50) + '\n');

    console.log('💡 You can now login with:');
    console.log(`   Email: ${adminUser.workEmail}`);
    console.log(`   Password: ${DEFAULT_ADMIN.password}\n`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Execute the seed function
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
