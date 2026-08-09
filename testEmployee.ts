import prisma from './src/config/database';

async function test() {
  try {
    const res = await prisma.$queryRawUnsafe(`SELECT * FROM employees WHERE id = 'b343dbc2-4753-4a46-9da2-559199d11432'`);
    console.log('Employee in employees table:', res);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
test();
