import { PrismaClient, FuelTankMod, ContrabandClass, DriverTrait, CargoType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding persistent logistics route contracts...');

  // 1. CLEAR EXISTING DATA IN CORRECT ORDER
  await prisma.activeRoute.deleteMany();
  await prisma.auctionBidLog.deleteMany();
  await prisma.auctionListing.deleteMany();
  await prisma.truckHistory.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.garage.deleteMany();
  await prisma.legalContract.deleteMany();
  await prisma.contrabandJob.deleteMany();
  await prisma.user.deleteMany();

  // 2. SEED STANDARD LEGAL CONTRACTS (Schengen Routes)
  console.log('[Seed] Creating legal cargo contracts...');
  await prisma.legalContract.createMany({
    data: [
      {
        cargoType: CargoType.ELECTRONICS,
        origin: 'Tallinn',
        destination: 'Riga',
        payoutLegal: 4500.00,
        distanceKm: 312.0,
        deadlineHours: 24,
      },
      {
        cargoType: CargoType.DAIRY_PRODUCTS,
        origin: 'Riga',
        destination: 'Vilnius',
        payoutLegal: 2800.00,
        distanceKm: 295.0,
        deadlineHours: 18,
      },
      {
        cargoType: CargoType.AGRICULTURAL_MACHINERY,
        origin: 'Kaunas',
        destination: 'Bialystok',
        payoutLegal: 5200.00,
        distanceKm: 240.0,
        deadlineHours: 36,
      },
      {
        cargoType: CargoType.STEEL_COILS,
        origin: 'Warsaw',
        destination: 'Bialystok',
        payoutLegal: 3900.00,
        distanceKm: 198.0,
        deadlineHours: 20,
      },
      {
        cargoType: CargoType.PHARMACEUTICALS,
        origin: 'Vilnius',
        destination: 'Kaunas',
        payoutLegal: 1500.00,
        distanceKm: 102.0,
        deadlineHours: 12,
      }
    ],
  });

  // 3. SEED SHADY DEALER CONTRABAND JOBS (Non-Schengen Smuggling Routes)
  console.log('[Seed] Creating back-alley smuggling contracts...');
  await prisma.contrabandJob.createMany({
    data: [
      {
        cargoClass: ContrabandClass.CLASS_A, // Luxuries / Tax-evaded goods
        riskMultiplier: 1.5,
        payoutBlack: 15000.00, // Massive cash returns
        payoutLegal: 0.00,
        origin: 'Minsk',
        destination: 'Vilnius',
      },
      {
        cargoClass: ContrabandClass.CLASS_B, // Chemicals / Restricted meds
        riskMultiplier: 2.8,
        payoutBlack: 35000.00,
        payoutLegal: 0.00,
        origin: 'Brest',
        destination: 'Bialystok',
      },
      {
        cargoClass: ContrabandClass.CLASS_C, // High-Value weapons / Radioactive items
        riskMultiplier: 4.5,
        payoutBlack: 95000.00,
        payoutLegal: 5000.00, // Laundered clean kickback bonus
        origin: 'Brest',
        destination: 'Warsaw',
      }
    ],
  });

  // 4. GENERATE A SHADY DEFAULTS ADMINISTRATOR SYSTEM OWNER
  console.log('[Seed] Seeding a test administrator account...');
  // Password is 'admin123' hashed with 10 salt rounds
  const adminHash = '$2b$10$w0M89iZk4Vb9F3C6sVp.ZOVQ4g/uC7u1.k1qgZJbL1hW1pYf2YwG.';
  
  const admin = await prisma.user.create({
    data: {
      username: 'dispatch_operator',
      passwordHash: adminHash,
      legalBalance: 120000.00,
      blackMarketBalance: 25000.00,
      reputationScore: 150,
      policeHeat: 10,
    },
  });

  // Allocate starting facilities and fleets to operator
  const garage = await prisma.garage.create({
    data: {
      ownerId: admin.id,
      city: 'Riga',
      capacity: 5,
      upgradeLevel: 2,
      hasStashRoom: true,
    },
  });

  const truck1 = await prisma.truck.create({
    data: {
      ownerId: admin.id,
      garageId: garage.id,
      model: 'Volvo FH16 Globetrotter',
      vin: 'VIN-VOLVO554897A',
      mileage: 12450.0,
      engineHealth: 92,
      tireWear: 84,
      fuelCapacity: 600.0,
      fuelTankMod: FuelTankMod.FALSE_BOTTOM, // rigged false fuel tank!
      scannerShielding: 2, // Lead-shielding level 2
    },
  });

  const truck2 = await prisma.truck.create({
    data: {
      ownerId: admin.id,
      garageId: garage.id,
      model: 'Scania S730 V8',
      vin: 'VIN-SCANIA998741B',
      mileage: 8200.0,
      engineHealth: 98,
      tireWear: 90,
      fuelCapacity: 500.0,
      fuelTankMod: FuelTankMod.STOCK,
    },
  });

  // Assign hireable driver cards
  await prisma.driver.create({
    data: {
      ownerId: admin.id,
      name: 'Vasilis Petrov',
      trait: DriverTrait.LEAD_FOOT,
      charisma: 14,
      loyalty: 85,
      fatigue: 20,
      tachoHours: 4.2,
      assignedTruckId: truck1.id,
    },
  });

  await prisma.driver.create({
    data: {
      ownerId: admin.id,
      name: 'Marek Kowalski',
      trait: DriverTrait.LOYAL,
      charisma: 8,
      loyalty: 95,
      fatigue: 45,
      tachoHours: 8.5,
      assignedTruckId: truck2.id,
    },
  });

  console.log('=================================================');
  console.log(' SEED SYSTEM SCRIPT EXECUTED SECURELY            ');
  console.log(' Seeded: 5 legal contracts, 3 smuggling jobs     ');
  console.log(' Seeded: User "dispatch_operator" (pass: admin123)');
  console.log(' Allocated: Riga garage + 2 rigged trucks + 2 drivers');
  console.log('=================================================');
}

main()
  .catch((e) => {
    console.error('[Seed] Critical seeding crash:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
