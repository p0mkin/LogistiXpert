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
    
    // Load cities
    try {
      const citiesPath = path.resolve(__dirname, '../../../client/resources/cities.json');
      this.citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
      this.cityIds = Object.keys(this.citiesData);
    } catch (e) {
      console.error("[AISyndicateService] Could not load cities.json. AI rivals disabled.");
      return;
    }
    
    console.log(`[AISyndicate] Starting AI Rival Syndicates (Spawning trucks every 8s)...`);
    
    this.intervalId = setInterval(() => {
      this.spawnRivalTruck();
    }, 8000);
  }

  private static spawnRivalTruck() {
    if (this.cityIds.length < 2) return;
    
    // Pick random start
    const startId = this.cityIds[Math.floor(Math.random() * this.cityIds.length)];
    const city = this.citiesData[startId];
    if (!city.connections || Object.keys(city.connections).length === 0) return;
    
    // Pick random connection
    const conns = Object.keys(city.connections);
    const endId = conns[Math.floor(Math.random() * conns.length)];
    
    const syndicates = [
      { name: "Bratva Logistics", color: "#e74c3c" },
      { name: "Neon Cartel", color: "#9b59b6" },
      { name: "Iron Syndicate", color: "#7f8c8d" }
    ];
    
    const rival = syndicates[Math.floor(Math.random() * syndicates.length)];
    const durationSec = Math.floor(Math.random() * 20) + 10; // 10 to 30 seconds visual
    
    const payload = {
      id: "ai_" + Math.random().toString(36).substring(7),
      companyName: rival.name,
      color: rival.color,
      origin: startId,
      destination: endId,
      duration: durationSec
    };
    
    GameWebSocketServer.broadcast("ai_truck_spawn", payload);
  }
}
