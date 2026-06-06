import { GameWebSocketServer } from '../websocket';
import fs from 'fs';
import path from 'path';

export class AISyndicateService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static citiesData: any = null;
  private static cityIds: string[] = [];
  
  static startTicker() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    try {
      const citiesPath = path.resolve(__dirname, '../../../client/resources/cities.json');
      this.citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8')).cities;
      this.cityIds = Object.keys(this.citiesData);
    } catch (e) {
      console.error("[AISyndicateService] Could not load cities.json. AI rivals disabled.");
      return;
    }
    
    console.log(`[AISyndicate] Starting AI Rival Syndicates & Interpol Engine...`);
    
    this.intervalId = setInterval(() => {
      this.spawnRivalTruck();
      this.checkInterpolDispatch();
    }, 8000);
  }

  private static spawnRivalTruck() {
    if (this.cityIds.length < 2) return;
    
    const startId = this.cityIds[Math.floor(Math.random() * this.cityIds.length)];
    const city = this.citiesData[startId];
    if (!city.connections || Object.keys(city.connections).length === 0) return;
    
    // Pick random connection
    const conns = Array.isArray(city.connections) ? city.connections : Object.keys(city.connections);
    if (conns.length === 0) return;
    const endId = conns[Math.floor(Math.random() * conns.length)];
    
    const syndicates = [
      { name: "Bratva Logistics", color: "#e74c3c" },
      { name: "Neon Cartel", color: "#9b59b6" },
      { name: "Iron Syndicate", color: "#7f8c8d" }
    ];
    
    const rival = syndicates[Math.floor(Math.random() * syndicates.length)];
    const durationSec = Math.floor(Math.random() * 20) + 10;
    
    const payload = {
      id: "ai_" + Math.random().toString(36).substring(7),
      companyName: rival.name,
      color: rival.color,
      origin: startId,
      destination: endId,
      duration: durationSec,
      isPolice: false
    };
    
    GameWebSocketServer.broadcast("ai_truck_spawn", payload);
  }

  private static async checkInterpolDispatch() {
    if (this.cityIds.length < 2) return;

    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      // Find companies with high police heat
      const highHeatCompanies = await prisma.company.findMany({
        where: { policeHeat: { gt: 50 } },
        select: { id: true, name: true, policeHeat: true }
      });
      
      if (highHeatCompanies.length === 0) return;
      
      // For each company, see if they have active trucks
      const activeRoutes = await prisma.activeRoute.findMany({
        where: {
          companyId: { in: highHeatCompanies.map((c: any) => c.id) },
          stage: 'TRANSIT',
          isPaused: false
        },
        include: { truck: true }
      });

      for (const route of activeRoutes) {
        const company = highHeatCompanies.find((c: any) => c.id === route.companyId);
        if (!company) continue;
        
        // Spawn chance based on heat (e.g. heat 100 = 30% chance per tick)
        const spawnChance = (company.policeHeat - 50) * 0.005;
        if (Math.random() < spawnChance) {
           const durationSec = 15; // Fast interceptor!
           
           const startId = this.cityIds[Math.floor(Math.random() * this.cityIds.length)];
           
           const payload = {
             id: "police_" + Math.random().toString(36).substring(7),
             companyName: "INTERPOL",
             color: "#0055ff", // Bright Blue
             origin: startId, // Interpol spawns from a random adjacent city or random city
             destination: route.currentCity, // Heading towards the player's last known city
             duration: durationSec,
             isPolice: true,
             targetTruckId: route.truckId,
             targetRouteId: route.id
           };
           
           GameWebSocketServer.broadcast("ai_truck_spawn", payload);
           console.log(`[Interpol] Dispatched interceptor after truck ${route.truckId} (Heat: ${company.policeHeat})`);

           // Schedule Bust logic
           setTimeout(async () => {
             try {
               const p = new PrismaClient();
               const activeR = await p.activeRoute.findUnique({ where: { id: route.id } });
               if (activeR && activeR.stage === 'TRANSIT') {
                 // The player didn't finish the route in time! BUSTED!
                 const bustFine = company.policeHeat > 80 ? 15000 : 8000;
                 
                 await p.company.update({
                   where: { id: company.id },
                   data: {
                     legalBalance: { decrement: bustFine },
                     policeHeat: { set: Math.max(0, company.policeHeat - 20) } // Heat goes down after bust
                   }
                 });

                 await p.truck.update({
                   where: { id: route.truckId },
                   data: {
                     isImpounded: true,
                     impoundReleaseAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5) // 5 days
                   }
                 });

                 await p.activeRoute.delete({ where: { id: route.id } });
                 await p.truckHistory.create({
                   data: {
                     truckId: route.truckId,
                     eventType: 'INTERPOL_BUST',
                     description: `INTERPOL RAID: Intercepted on the road! Fined $${bustFine} Clean Cash and truck impounded for 5 days.`
                   }
                 });

                 // Optional: Send domain event here if we had UOW, but we can just broadcast
                 GameWebSocketServer.broadcast('alert', {
                    message: `🚨 INTERPOL RAID: ${company.name}'s truck was intercepted! They were fined $${bustFine} and the truck is impounded.`,
                    type: 'error'
                 });
                 console.log(`[Interpol] Successfully busted truck ${route.truckId}`);
               }
             } catch(err) {
               console.error("[Interpol] Bust failed:", err);
             }
           }, (durationSec - 2) * 1000); // Intercept slightly before animation ends
        }
      }
    } catch (e) {
      console.error("[Interpol] Dispatch error:", e);
    }
  }
}
