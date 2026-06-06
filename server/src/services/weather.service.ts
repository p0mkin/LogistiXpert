import { GameWebSocketServer } from '../websocket';
import fs from 'fs';
import path from 'path';
import { TimeSimulationService, Season } from './time.service';

export class WeatherService {
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
      console.error("[WeatherService] Could not load cities.json. Dynamic weather disabled.");
      return;
    }

    console.log(`[WeatherService] Starting Dynamic Global Weather Engine...`);

    // Broadcast a new weather front every 30 seconds
    this.intervalId = setInterval(() => {
      this.spawnWeatherFront();
    }, 30000);
  }

  private static spawnWeatherFront() {
    if (this.cityIds.length < 1) return;

    // Pick a random epicenter
    const epicenterId = this.cityIds[Math.floor(Math.random() * this.cityIds.length)];
    const epicenter = this.citiesData[epicenterId];

    // Pick a weather type
    const season = TimeSimulationService.getCurrentSeason();
    const types = ['SEVERE_STORM', 'THICK_FOG', 'BLIZZARD'];
    let weights = [0.4, 0.4, 0.2]; // Default

    switch (season) {
      case Season.WINTER:
        weights = [0.1, 0.2, 0.7]; // Lots of blizzards
        break;
      case Season.SPRING:
        weights = [0.6, 0.3, 0.1]; // Lots of storms
        break;
      case Season.SUMMER:
        weights = [0.3, 0.6, 0.1]; // Mostly fog / heat hazes
        break;
      case Season.AUTUMN:
        weights = [0.5, 0.4, 0.1]; // Balanced storms and fog
        break;
    }

    let r = Math.random();
    let type = types[0];
    for (let i = 0; i < types.length; i++) {
      if (r < weights[i]) {
        type = types[i];
        break;
      }
      r -= weights[i];
    }

    // Force blizzard if it's high latitude
    if (epicenter.coords.x > 56.0) {
      if (Math.random() > 0.5) type = 'BLIZZARD';
    }

    // Calculate a radius for the storm (in game units/coords)
    // A large radius covers multiple cities
    const radius = 5.0 + Math.random() * 8.0; // 5 to 13 coord units wide

    // Find affected cities
    const affectedCities: string[] = [];
    for (const cid of this.cityIds) {
      const c = this.citiesData[cid];
      const dx = c.coords.x - epicenter.coords.x;
      const dy = c.coords.y - epicenter.coords.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        affectedCities.push(cid);
      }
    }

    const payload = {
      id: "weather_" + Math.random().toString(36).substring(7),
      type: type,
      epicenterId: epicenterId,
      epicenterCoords: epicenter.coords,
      radius: radius,
      affectedCities: affectedCities,
      duration: 60000 + Math.random() * 60000 // Lasts 1 to 2 minutes
    };

    GameWebSocketServer.broadcast("weather_front_update", payload);
    console.log(`[WeatherService] Spawned massive ${type} over ${affectedCities.length} cities (Epicenter: ${epicenter.name})`);
  }
}
