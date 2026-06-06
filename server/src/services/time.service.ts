import { PrismaClient } from '@prisma/client';
import { GameWebSocketServer } from '../websocket';

const prisma = new PrismaClient();

export enum Season {
  SPRING = 'SPRING',
  SUMMER = 'SUMMER',
  AUTUMN = 'AUTUMN',
  WINTER = 'WINTER'
}

export class TimeSimulationService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static simulatedTimeUnix: number = 1780287120.0; // Default start
  
  // Real-world tick frequency (runs every 1 second)
  private static TICK_INTERVAL_MS = 1000;
  private static TIME_SPEED_MULTIPLIER = 720.0; // 1 real sec = 12 simulated mins
  private static dbSaveCounter = 0;

  static async startTicker() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load state from DB
    try {
      let state = await prisma.systemState.findUnique({ where: { id: "GLOBAL" } });
      if (!state) {
        state = await prisma.systemState.create({
          data: { id: "GLOBAL", simulatedTimeUnix: this.simulatedTimeUnix }
        });
      }
      this.simulatedTimeUnix = state.simulatedTimeUnix;
    } catch (err) {
      console.error("[TimeService] Failed to load SystemState. Using default time.", err);
    }

    console.log(`[TimeService] Starting global time simulation at epoch ${this.simulatedTimeUnix}`);

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.TICK_INTERVAL_MS);
  }

  private static async tick() {
    // Advance simulated time
    this.simulatedTimeUnix += this.TIME_SPEED_MULTIPLIER * (this.TICK_INTERVAL_MS / 1000.0);
    this.dbSaveCounter++;

    // Broadcast sync to all clients
    const season = this.getCurrentSeason();
    GameWebSocketServer.broadcast('time_sync', {
      simulatedTimeUnix: this.simulatedTimeUnix,
      season: season
    });

    // Save to DB every 5 ticks (5 seconds) to avoid spam
    if (this.dbSaveCounter >= 5) {
      this.dbSaveCounter = 0;
      try {
        await prisma.systemState.upsert({
          where: { id: "GLOBAL" },
          update: { simulatedTimeUnix: this.simulatedTimeUnix },
          create: { id: "GLOBAL", simulatedTimeUnix: this.simulatedTimeUnix }
        });
      } catch (err) {
        console.error("[TimeService] Failed to save time state", err);
      }
    }
  }

  public static getSimulatedTimeUnix(): number {
    return this.simulatedTimeUnix;
  }

  public static getCurrentSeason(): Season {
    // Convert unix to JS Date (multiply by 1000 for ms)
    const date = new Date(this.simulatedTimeUnix * 1000);
    const month = date.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)

    // Spring: March (2), April (3), May (4)
    if (month >= 2 && month <= 4) return Season.SPRING;
    // Summer: June (5), July (6), August (7)
    if (month >= 5 && month <= 7) return Season.SUMMER;
    // Autumn: September (8), October (9), November (10)
    if (month >= 8 && month <= 10) return Season.AUTUMN;
    // Winter: December (11), January (0), February (1)
    return Season.WINTER;
  }
}
