import prisma from '../config/database';

async function createTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS employee_role_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        employee_id UUID NOT NULL REFERENCES employees(id),
        role_name VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table employee_role_history created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

createTable();
