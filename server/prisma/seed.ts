import { PrismaClient, FuelTankMod, ContrabandClass, DriverTrait, CargoType, Jurisdiction, CompanyRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Seeding persistent logistics database...');

  // 1. CLEAR EXISTING DATA IN CORRECT ORDER
  console.log('[Seed] Clearing existing tables...');
  await prisma.clanContractContribution.deleteMany();
  await prisma.clanContract.deleteMany();
  await prisma.activeRoute.deleteMany();
  await prisma.auctionBidLog.deleteMany();
  await prisma.auctionListing.deleteMany();
  await prisma.truckHistory.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.garage.deleteMany();
  await prisma.frontBusiness.deleteMany();
  await prisma.companyShare.deleteMany();
  await prisma.companyMember.deleteMany();
  await prisma.company.deleteMany();
  await prisma.clan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.legalContract.deleteMany();
  await prisma.contrabandJob.deleteMany();

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
      },
      {
        cargoType: CargoType.DAIRY_PRODUCTS,
        origin: 'Vilnius',
        destination: 'Elektrenai',
        payoutLegal: 1500.00,
        distanceKm: 50.0,
        deadlineHours: 8,
      },
      {
        cargoType: CargoType.TIMBER,
        origin: 'Siauliai',
        destination: 'Kursenai',
        payoutLegal: 750.00,
        distanceKm: 25.0,
        deadlineHours: 6,
      },
      {
        cargoType: CargoType.ELECTRONICS,
        origin: 'Klaipeda',
        destination: 'Telsiai',
        payoutLegal: 2700.00,
        distanceKm: 90.0,
        deadlineHours: 10,
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
  
  const adminUser = await prisma.user.create({
    data: {
      username: 'dispatch_operator',
      passwordHash: adminHash,
    },
  });

  // Create Clan
  console.log('[Seed] Seeding starting clans...');
  const testClan = await prisma.clan.create({
    data: {
      name: 'Syndicate Logistics',
      treasury: 15000.00,
      reputation: 100,
    },
  });

  // Create starting Company for administrator
  const adminCompany = await prisma.company.create({
    data: {
      name: 'LogistiXpert HQ',
      legalBalance: 120000.00,
      blackMarketBalance: 25000.00,
      reputationScore: 150,
      policeHeat: 10,
      jurisdiction: Jurisdiction.BALTICS,
      clanId: testClan.id,
    },
  });

  // Create member link
  await prisma.companyMember.create({
    data: {
      userId: adminUser.id,
      companyId: adminCompany.id,
      role: CompanyRole.OWNER,
    },
  });

  // Allocate starting facilities and fleets to operator
  const garage = await prisma.garage.create({
    data: {
      companyId: adminCompany.id,
      city: 'Riga',
      capacity: 5,
      upgradeLevel: 2,
      hasStashRoom: true,
      dieselStorage: 1500.0,
      electricityStorage: 300.0,
      adblueStorage: 150.0,
      co2Allowances: 10.0,
    },
  });

  // Vilnius Garage
  await prisma.garage.create({
    data: {
      companyId: adminCompany.id,
      city: 'Vilnius',
      capacity: 3,
      upgradeLevel: 1,
      hasStashRoom: false,
      dieselStorage: 1000.0,
      electricityStorage: 200.0,
      adblueStorage: 100.0,
      co2Allowances: 5.0,
    },
  });

  // Siauliai Garage
  await prisma.garage.create({
    data: {
      companyId: adminCompany.id,
      city: 'Siauliai',
      capacity: 3,
      upgradeLevel: 1,
      hasStashRoom: false,
      dieselStorage: 1000.0,
      electricityStorage: 200.0,
      adblueStorage: 100.0,
      co2Allowances: 5.0,
    },
  });

  // Klaipeda Garage
  await prisma.garage.create({
    data: {
      companyId: adminCompany.id,
      city: 'Klaipeda',
      capacity: 3,
      upgradeLevel: 1,
      hasStashRoom: false,
      dieselStorage: 1000.0,
      electricityStorage: 200.0,
      adblueStorage: 100.0,
      co2Allowances: 5.0,
    },
  });

  const truck1 = await prisma.truck.create({
    data: {
      companyId: adminCompany.id,
      garageId: garage.id,
      model: 'Moose FH16 Globetrotter',
      vin: 'VIN-MOOSE554897A',
      mileage: 12450.0,
      engineHealth: 92,
      tireWear: 84,
      fuelCapacity: 600.0,
      fuelTankMod: FuelTankMod.FALSE_BOTTOM, // rigged false fuel tank!
      scannerShielding: 2, // Lead-shielding level 2
      manufacturer: 'Moose',
      tier: 'Heavy Rigid Cab',
    },
  });

  const truck2 = await prisma.truck.create({
    data: {
      companyId: adminCompany.id,
      garageId: garage.id,
      model: 'Scarfia R500',
      vin: 'VIN-SCANIA998741B',
      mileage: 8200.0,
      engineHealth: 98,
      tireWear: 90,
      fuelCapacity: 500.0,
      fuelTankMod: FuelTankMod.STOCK,
      manufacturer: 'Scarfia',
      tier: 'Rigid Heavy',
    },
  });

  // Assign hireable driver cards
  await prisma.driver.create({
    data: {
      companyId: adminCompany.id,
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
      companyId: adminCompany.id,
      name: 'Marek Kowalski',
      trait: DriverTrait.LOYAL,
      charisma: 8,
      loyalty: 95,
      fatigue: 45,
      tachoHours: 8.5,
      assignedTruckId: truck2.id,
    },
  });

  // Seed Joint Clan Contract for Syndicate Logistics
  console.log('[Seed] Seeding clan board joint contracts...');
  await prisma.clanContract.create({
    data: {
      title: 'Underworld Baltic Contraband Haul',
      cargoClass: ContrabandClass.CLASS_B,
      origin: 'Minsk',
      destination: 'Warsaw',
      distanceKm: 540.0,
      totalVolume: 5000.0,
      volumeDelivered: 0.0,
      payoutBlack: 120000.00,
      payoutLegal: 10000.00,
      clanId: testClan.id,
    },
  });

  console.log('=================================================');
  console.log(' SEED SYSTEM SCRIPT EXECUTED SECURELY            ');
  console.log(' Seeded: 5 legal contracts, 3 smuggling jobs     ');
  console.log(' Seeded: User "dispatch_operator" (pass: admin123)');
  console.log(' Seeded: Clan "Syndicate Logistics" + 1 Clan Board contract');
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
