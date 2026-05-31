# LogistiXpert — Truck Manager Pro: Underworld Logistics

> **Codename**: Project Nighthaul  
> **Platforms**: Windows · Linux · Android  
> **Stack**: Godot 4.3 (GDScript) + Node.js 20 (TypeScript) + PostgreSQL + Redis

---

## 🎮 Game Overview

A cross-platform **persistent multiplayer tycoon/smuggling simulation** set in Eastern Europe's Schengen border network. Run a legitimate freight company by day. Run contraband through customs checkpoints by night.

### Core Systems
- **Fleet Management** — Buy, sell, repair, and insure trucks
- **Driver Roster** — Each driver has Charisma, Loyalty, Fatigue, and Tachograph hour tracking
- **Legal Contracts** — Electronics, dairy, timber, steel coil routes for clean income
- **Contraband Jobs** — Class A/B/C cargo with customs inspection mini-games
- **Border Checkpoints** — Real-time decisions: Submit to Scan / Bribe Officer / Run Barricade
- **Money Laundering Fronts** — Taxi Co, Café, Logistics Front businesses to clean dirty cash
- **Live Auction House** — Buy/sell trucks in real-time with all other players via WebSocket
- **Leaderboards** — Fleet Value, Underworld Rep, Total Mileage, Heat Index, Auction Wins

---

## 🗂️ Project Structure

```
LogistiXpert/
├── client/          # Godot 4.3 game client (GDScript)
│   ├── autoload/    # GameState, NetworkManager, UIEffects singletons
│   ├── scenes/      # All game screens (map, dispatch, garage, auction, laundry...)
│   └── resources/   # Cities JSON route network dataset
│
└── server/          # Node.js 20 + TypeScript backend
    ├── src/
    │   ├── routes/      # Express REST API endpoints
    │   ├── services/    # Background simulation services (dispatch, border, auction)
    │   ├── websocket/   # Raw WebSocket server (ws) + event handlers
    │   └── middleware/  # JWT auth, rate limiting
    └── prisma/          # PostgreSQL schema (Prisma ORM)
```

---

## 🚀 Quick Start (Development)

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Godot 4.3+

### 2. Backend Setup

```bash
cd server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, JWT_SECRET

# Run database migrations
npm run prisma:migrate

# Start development server (hot-reload)
npm run dev
```

### 3. Docker Compose (Recommended)

```bash
cd server
docker compose up -d
```
This spins up PostgreSQL, Redis, and the Express API server together.

### 4. Godot Client
- Open `client/project.godot` in Godot 4.3+
- Press **F5** to run
- The client connects to `ws://127.0.0.1:3000/ws` by default

---

## 🔌 API Overview

| Endpoint | Description |
|---|---|
| `POST /api/auth/register` | Create new player account |
| `POST /api/auth/login` | Authenticate and get JWT |
| `GET /api/garage` | List player's garages and trucks |
| `GET /api/dispatch/contracts/legal` | Browse available legal contracts |
| `GET /api/dispatch/contracts/contraband` | Browse black market jobs |
| `POST /api/dispatch/launch` | Dispatch a truck on a route |
| `POST /api/driver/:id/stimulate` | Administer illegal stimulants to suppress fatigue |
| `POST /api/driver/:id/spoof-tacho` | Install ECU Tacho Spoof hack |
| `POST /api/driver/:id/assign` | Assign driver to a truck |
| `POST /api/driver/:id/rest` | Order driver rest rotation |
| `GET /api/auction` | Browse active auction listings |
| `POST /api/auction/:id/bid` | Place a bid (also via WebSocket) |
| `POST /api/laundry/buy` | Purchase a laundering front business |
| `POST /api/laundry/:id/launder` | Launder dirty cash through a front |
| `POST /api/laundry/:id/upgrade` | Upgrade front capacity and yield |
| `POST /api/laundry/:id/bribe-auditors` | Recover from a police raid early |
| `GET /api/leaderboard/underworld-rep` | Top 20 by Underworld Reputation |
| `GET /api/leaderboard/fleet-value` | Top 20 by Fleet Asset Value |

### WebSocket Events (Server → Client)
| Event | Description |
|---|---|
| `route:progress` | Live truck telemetry: progress%, fatigue, tacho hours, engine/tire health |
| `route:completed` | Route delivered successfully with payout |
| `border:inspection_event` | Truck paused at customs — awaiting player decision |
| `border:cleared / bust / bribe_success / bribe_fail / run_success / run_fail` | Border resolution outcome |
| `alert:weigh_station_fine` | Tachograph violation fine issued |
| `alert:driver_wreck` | Microsleep crash — route aborted |
| `alert:driver_snitched` | Low-loyalty driver betrayal bust |
| `alert:engine_breakdown` | Engine failure mid-route |
| `auction:bid_update` | Another player placed a bid |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Game Client | Godot 4.3 (GDScript, GL Compatibility Renderer) |
| Backend | Node.js 20, TypeScript 5, Express 4 |
| Real-time | Raw WebSockets (`ws` library) |
| Database | PostgreSQL 15 + Prisma ORM |
| Cache / State | Redis 7 (auction state, sessions) |
| Auth | JWT (jsonwebtoken) |
| Validation | Zod |
| Testing | Jest + Supertest |
| Containerization | Docker + Docker Compose |
| Mobile Export | Android (ARM64, SDK 34) |
