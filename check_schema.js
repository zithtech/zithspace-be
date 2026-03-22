const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Prisma DMMF User fields:');
  const userModel = prisma._dmmf.modelMap.User;
  if (userModel) {
    userModel.fields.forEach(f => {
       console.log(`${f.name}: ${f.kind} ${f.type}`);
    });
  } else {
    console.log('User model not found in DMMF');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
