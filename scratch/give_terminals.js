const { PrismaClient } = require('../server/node_modules/@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://root:password@localhost:5432/truck_manager?schema=public"
    }
  }
});

const CITIES_DATASET = [
  "helsinki", "turku", "stockholm", "malmoe", "copenhagen",
  "tallinn", "riga", "vilnius", "klaipeda", "kaunas",
  "kaliningrad", "gdansk", "warsaw", "krakow", "berlin",
  "hamburg", "prague", "brest", "minsk", "kyiv",
  "oslo", "london", "paris", "amsterdam", "brussels",
  "munich", "vienna", "budapest", "bern"
];

async function run() {
  const companies = await prisma.company.findMany();
  if (companies.length === 0) {
    console.log("No companies found.");
    return;
  }
  
  const targetCompany = companies[0]; // Assuming single player/main company
  console.log(`Targeting company: ${targetCompany.name}`);
  
  let addedCount = 0;
  for (const city of CITIES_DATASET) {
    const existing = await prisma.garage.findFirst({
      where: { companyId: targetCompany.id, city: city }
    });
    
    if (!existing) {
      await prisma.garage.create({
        data: {
          companyId: targetCompany.id,
          city: city,
          capacity: 5,
          level: 1
        }
      });
      addedCount++;
      console.log(`+ Added terminal in ${city.toUpperCase()}`);
    }
  }
  
  console.log(`Complete. Added ${addedCount} new terminals.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
