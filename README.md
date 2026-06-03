# LogistiXpert — Truck Manager Pro: Underworld Logistics

<div align="center">
  <img width="1276" height="756" alt="image" src="https://github.com/user-attachments/assets/1b774c23-ec03-4468-8449-3bb22cedd49b" />

  <p align="center">
    <strong>A high-stakes, real-time multiplayer logistics simulator set in Eastern Europe's Schengen highway network.</strong>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20Android-00ffff?style=flat-square" alt="Platforms" />
    <img src="https://img.shields.io/badge/Client-Godot%204.3%20%28GDScript%29-00e676?style=flat-square" alt="Client" />
    <img src="https://img.shields.io/badge/Server-Node.js%2020%20%7C%20TypeScript-8a2be2?style=flat-square" alt="Server" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Redis-ff3e00?style=flat-square" alt="Database" />
  </p>
</div>

---

## 🌌 Overview

**LogistiXpert** is a persistent, hybrid-economy multiplayer simulation game where legitimate freight transport collides with the high-stakes underworld of border smuggling. 

Set across an expansive tactical map of Central, Northern, and Eastern Europe (spanning Germany, Sweden, Finland, Poland, Belarus, and Ukraine), you play as a logistics operator. Establish clean hauling routes by day to launder funds, recruit elite drivers, buy/modify state-of-the-art trucks, and smuggle high-risk contraband across highly contested borders by night.

---

## ⚡ Key Gameplay Features

### 🚛 1. Dual-Economy Tycoon
*   **Clean Operations**: Transport legitimate industrial cargo across the European Union to earn clean capital, pay corporate taxes, and fund official facility expansions.
*   **Underworld Logistics**: Smuggle contraband (illicit cargo, high-tax commodities) for massive black market payouts, and launder your dirty funds through legal front businesses to keep authorities off your back.

### 🛌 2. Fleet & Active Roster Operations
*   Manage a fleet of custom trucks (featuring live telemetry, engine health, and tire wear monitors).
*   Recruit contractor drivers with distinct personality traits (`LOYAL`, `LEAD_FOOT`, `SLEEP_DEPRIVED`).
*   Manage driver fatigue, schedule motels/resting, or order risky chemical stimulants to keep your trucks moving on a tight schedule.

### 🔧 3. Parts Shop & Black Market Tuning
*   Perform routine maintenance (engine rebuilds, tire rotations) to prevent devastating highway wrecks.
*   Install illegal performance mods: engine tuning kits, chassis cavity stashes, false-bottom fuel tanks, and ECU tachograph spoofs to bypass maximum working hours regulations.

### 📈 4. Real-Time Commodity Trading
*   Buy and store critical logistics commodities (Diesel Fuel, EV Grid Power, AdBlue Agent, and CO2 Limit Permits) at your HQ Stock Depot.
*   Trade on a dynamic, fluctuating cooperative stock market where prices react to live supply/demand, and upgrade silo capacities to maximize trading margins.

### 🏁 5. High-Risk Border Crossings
*   Navigate dynamic border checkpoints (e.g. Brest-Terespol, Polish Schengen gates, external warning checkpoints).
*   When stopped by Customs, play the high-stakes decision game: submit to a high-risk cargo scan, bribe border officers using your driver's charisma, or smash through the barricades in a high-speed pursuit.

---

## 🛠 Tech Stack

*   **Game Engine**: [Godot 4.3](https://godotengine.org/) (GDScript, GLES3 Compatibility renderer optimized for desktop & mobile).
*   **Backend Server**: Node.js 20 (TypeScript) with [Express](https://expressjs.com/) REST APIs & high-performance raw WebSockets (`ws`).
*   **Database & ORM**: PostgreSQL 15 managed with [Prisma ORM](https://www.prisma.io/).
*   **In-Memory Store & Cache**: Redis 7 (handles multiplayer auction distributed locks, live bids, and active sessions).

---

## 🚀 Quickstart Guide

### 📂 Repository Structure
```text
├── client/          # Godot 4.3 Game Client project
└── server/          # Node.js Express & WebSocket API Server
```

### 1. Launching the Backend Server
First, navigate to the `/server` folder and set up your environment variables (`.env`):
```bash
PORT=3000
DATABASE_URL="postgresql://logistix_admin:SecretPass@localhost:5432/logistix_db?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="YourSecureEncryptionKey!"
```

Launch the database, redis cache, and backend server using Docker Compose:
```bash
cd server
docker compose up -d --build

# Run migrations and seed the database
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### 2. Launching the Godot 4.3 Client
*   Open the [Godot Engine 4.3](https://godotengine.org/download) launcher.
*   Import the project from the `client/` folder.
*   Click **Play** (or press `F5`) to run the game!

---

## 📖 Documentation

For developers, designers, and contributors, the detailed game design, technical sequence diagrams, and schema documentation are stored in the `/docs` folder:

*   📑 **[Technical Specifications & UML Diagrams](docs/technical_specs.md)**: Explore the system architecture, simulation loop, auction ledger mechanics, and API endpoint schemas.

---

## ⚖️ License
LogistiXpert is private proprietary software. Code is provided for development, debugging, and educational purposes.
