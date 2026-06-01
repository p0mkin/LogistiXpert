import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/seed';

const prisma = new PrismaClient();

async function main() {
  await seedDatabase(prisma);
}

main()
  .catch((e) => {
    console.error('[Seed] Critical seeding crash:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
