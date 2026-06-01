# LogistiXpert — Truck Manager Pro: Underworld Logistics

> **Codename**: Project Nighthaul  
> **Target Platforms**: PC (Windows · Linux) · Mobile (Android SDK 34)  
> **Production Stack**: Godot 4.3 (GDScript, Compatibility GLES3) · Node.js 20 (TypeScript) · PostgreSQL 15 · Redis 7

---

## 🎮 Game Architecture Overview

LogistiXpert is a persistent, real-time multiplayer logistics tycoon and smuggling simulator set in Eastern Europe's Schengen highway network. Players establish legitimate cargo fleets by day, laundering clean funds, and transport contraband across highly contested borders by night, making critical tactical inspection-evasion decisions.

```mermaid
graph TD
    subgraph Client ["Godot 4.3 Client Layer (Windows / Linux / Android)"]
        UI["UI Screens (Showroom, Garage, Parts, Auction, Dispatch)"]
        GS["GameState (Local State & Auto-sync)"]
        NM["NetworkManager (WebSocket & REST Client)"]
        UIEffects["UIEffects (Procedural Synth & Micro-Scaling)"]
        UI --> GS
        UI --> NM
        NM --> UIEffects
    end

    subgraph LB ["Ingress / Load Balancer (Nginx)"]
        Nginx["Reverse Proxy"]
    end

    subgraph Backend ["Express & WS Game Server (Node.js 20 + TS)"]
        Express["Express.js API Router (REST)"]
        WSS["WebSocket Server (ws library)"]
        Sim["Sim Engine Tick Service (Interval Runner)"]
        AuctionServ["Auction Service (Bid Ledger)"]
        BorderServ["Border Inspection Service"]
        LockServ["Distributed Lock Service"]
        
        Express --> LockServ
        WSS --> LockServ
        Sim --> BorderServ
        WSS --> AuctionServ
    end

    subgraph Cache ["Volatile Store"]
        Redis["Redis 7 (Auction timers, Active bids, Player sessions)"]
    end

    subgraph DB ["Persistent Store"]
        Prisma["Prisma ORM Client"]
        Postgres[("PostgreSQL 15 (Users, Trucks, Companies, Routes, History)")]
        Prisma --> Postgres
    end

    NM -- "HTTPS REST" --> Nginx
    NM -- "Live WS" --> Nginx
    Nginx --> Express
    Nginx --> WSS

    Express & WSS & Sim --> Prisma
    Express & WSS & AuctionServ & Sim --> Redis
```

---

## ⚙️ Core Game Algorithms

### 1. Real-Time Simulation Tick Loop
The backend simulation engine (`dispatch.service.ts`) runs on a high-precision 10-second tick interval. It processes all en-route trucks, applies driver autopilot delegation physics, increments tachograph fatigue hours, simulates high-risk microsleep wrecks, and handles weather modifiers and border Customs traps.

```mermaid
graph TD
    Start(["Sim Engine 10s Tick Trigger"]) --> FetchActive["Fetch all ActiveRoute rows where status = 'EN_ROUTE'"]
    FetchActive --> LoopRoutes{"Are there routes?"}
    
    LoopRoutes -- "Yes" --> ProcessRoute["Process next ActiveRoute"]
    LoopRoutes -- "No" --> End(["Tick Completed"])
    
    ProcessRoute --> CheckPause{"Is route paused (Customs / Inspection)?"}
    CheckPause -- "Yes" --> NextRoute["Move to next route in list"] --> ProcessRoute
    
    CheckPause -- "No" --> ReadDelegation{"Get Autopilot Policy"}
    
    ReadDelegation --> PolicySafe["SAFE Policy<br>- Normal speed<br>- Zero tacho violations<br>- Low vehicle wear"]
    ReadDelegation --> PolicyAverage["AVERAGE Policy<br>- Moderate speed<br>- Normal wear<br>- Balanced rest schedule"]
    ReadDelegation --> PolicyGreedy["GREEDY Policy<br>- Max speed (+20%)<br>- Runs past tacho hours<br>- High fuel usage & wear"]
    
    PolicySafe & PolicyAverage & PolicyGreedy --> ApplyProgress["Calculate travel delta & update progress%"]
    
    ApplyProgress --> CheckFatigue["Increment driver fatigue hours"]
    CheckFatigue --> MicrosleepCheck{"Fatigue > 11 hrs?<br>(Microsleep Roll)"}
    
    MicrosleepCheck -- "Failed (Wreck)" --> TriggerWreck["Issue Wreck Alert<br>- Wreck truck (health = 0)<br>- Abort route & drop cargo<br>- Broadcast alert:driver_wreck"] --> NextRoute
    
    MicrosleepCheck -- "Passed (Safe)" --> CheckWeather["Roll Weather Events (Rain/Snow/Storm)"]
    CheckWeather --> ApplyWear["Apply engine/tire wear & consume fuel"]
    
    ApplyWear --> CheckBorder{"Has progress% crossed a border checkpoint?"}
    
    CheckBorder -- "Yes" --> TriggerBorder["Pause Route<br>- Change status to 'AT_BORDER'<br>- Emit WS alert: border_inspection_started<br>- Await Player Choice"] --> NextRoute
    
    CheckBorder -- "No" --> CheckArrival{"Is progress% >= 100%?"}
    CheckArrival -- "Yes" --> TriggerDelivery["Complete Route<br>- Persist company payouts (Clean/Dirty)<br>- Record TruckHistory logs<br>- Emit WS event: route_completed<br>- Delete ActiveRoute row"] --> NextRoute
    
    CheckArrival -- "No" --> UpdateRoute["Update ActiveRoute database state<br>- Progress%, fatigue, fuel, health<br>- Emit WS event: route_progress"] --> NextRoute
```

### 2. Live Auction Bid-Settlement Ledger
The auction engine handles synchronized real-time bidding using PostgreSQL-backed transactions guarded by a Redis distributed locking mechanism to enforce absolute consistency, prevent double-spend or outbid race conditions, and push sub-millisecond status updates over active WebSocket channels.

```mermaid
sequenceDiagram
    autonumber
    actor PlayerA as Bidder A (Client)
    participant WS as WebSocket Server
    participant Lock as Lock Service (Redis/Postgres)
    participant Redis as Redis Cache
    participant DB as Postgres (Prisma)
    actor Seller as Seller (Client)
    actor PlayerB as Bidder B (Client)

    PlayerA->>WS: Send WebSocket Bid Packet (auctionId, amount)
    WS->>Lock: Acquire exclusive lock for auctionId
    alt Lock acquired
        Lock-->>WS: Lock Granted
        WS->>DB: Fetch Active AuctionListing (where status = 'ACTIVE')
        DB-->>WS: Return AuctionListing & highest current bid
        
        alt Bid Amount <= Current High Bid
            WS->>WS: Log error: "Insufficient bid amount"
            WS-->>PlayerA: Send WS rejected packet ("auction_bid_resolved" = false)
            WS->>Lock: Release lock for auctionId
        else Bid Amount > Current High Bid
            WS->>Redis: Update active bid memory (currentBid, highestBidder)
            WS->>DB: Update AuctionListing (currentBid, highestBidderCompanyId, bidCount)
            WS->>DB: Create AuctionBidLog entry
            DB-->>WS: DB Write Complete
            WS->>Lock: Release lock for auctionId
            WS-->>PlayerA: Send WS approved packet ("auction_bid_resolved" = true)
            WS-->>PlayerB: Broadcast WebSocket Event: "auction:bid_update" (new high bid)
            WS-->>Seller: Broadcast WebSocket Event: "auction:bid_update"
        end
    else Lock timeout (concurrency contention)
        WS-->>PlayerA: Send WS rejected packet ("Please retry bid")
    end
```

### 3. Border Customs Decision Matrix
When transporting black-market payloads, trucks face border police inspection checkpoints. Players must resolve inspections programmatically, pitting vehicle upgrade rigs and driver attributes against scanning sensors.

```mermaid
graph TD
    StartCheck["Schengen Border Inspection Paused"] --> AwaitPlayer["Await Player Choice (via UI buttons)"]
    
    AwaitPlayer --> ChoiceScan["Choice A: Submit to Scan"]
    AwaitPlayer --> ChoiceBribe["Choice B: Bribe Border Officer"]
    AwaitPlayer --> ChoiceRun["Choice C: Run Checkpoint Barricade"]
    
    %% Choice A: Scan Path
    ChoiceScan --> RollScan{"Scan Roll<br>P(Detection) = Base Contraband Risk * Shielding Mitigation"}
    RollScan -- "Passed (Shielding Held)" --> ScanSuccess["Border Cleared<br>- Emit WS border_event_resolved: 'cleared'<br>- Resume route EN_ROUTE"]
    RollScan -- "Failed (X-Ray Bust)" --> ScanFail["Busted by Customs!<br>- Seize contraband cargo<br>- Jail driver (inactive)<br>- Issue $15,000 fine<br>- Emit WS border_event_resolved: 'bust'"]
    
    %% Choice B: Bribe Path
    ChoiceBribe --> DeductBribe["Deduct Dirty Cash Bribe Amount"]
    DeductBribe --> RollBribe{"Bribe Roll<br>P(Success) = Bribe Ratio * Driver Charisma Modifier"}
    RollBribe -- "Success" --> BribeSuccess["Officer Bribe Accepted<br>- Emit WS border_event_resolved: 'bribe_success'<br>- Resume route EN_ROUTE"]
    RollBribe -- "Failed" --> BribeFail["Bribe Rejected & Flagged!<br>- Bribe cash confiscated<br>- Force Scan with 2.0x detection multiplier<br>- Emit WS border_event_resolved: 'bribe_fail'"]
    BribeFail --> RollScan
    
    %% Choice C: Run Path
    ChoiceRun --> RollRun{"Escape Roll<br>P(Success) = Engine Tuning HP * Driver Loyalty Modifier"}
    RollRun -- "Success" --> RunSuccess["Barricade Smashed Successfully!<br>- Truck escapes border<br>- Heat level +35 units<br>- Resume route EN_ROUTE<br>- Emit WS border_event_resolved: 'run_success'"]
    RollRun -- "Failed (Crashed / Boxed)" --> RunFail["Stopped by Armed Force!<br>- Truck completely wrecked (health = 0)<br>- Driver jailed, contraband seized<br>- Massive Heat increase (+50)<br>- Emit WS border_event_resolved: 'run_fail'"]
```

---

## 📊 Database Indexing & Optimizations

To handle hundreds of simulation ticks and concurrent live bids without transaction bottlenecks, high-frequency tables have been strategically optimized using precise single and compound B-Tree indexes inside `schema.prisma`:

*   **`User`**: Indexed on `[username]` for sub-millisecond JWT login credentials verification.
*   **`ActiveRoute`**: Compound index `@@index([companyId])` and `@@index([truckId])` for fast en-route telemetry sweeps and real-time client progression charts.
*   **`AuctionListing`**: Single-field indexes on high-frequency columns `truckId`, `sellerCompanyId`, `highestBidderCompanyId` and `status` to ensure instantaneous auction boards filtering and settlement checks.
*   **`AuctionBidLog`**: Indexed on `[auctionId]` and `[bidderCompanyId]` to retrieve historic bids under 2ms.
*   **`FrontBusiness`**: Single-field index `@@index([companyId])` to compute real-time laundering cycle totals.
*   **Analytics Reports (`TerminalDailyReport` & `CityDailyFreight`)**: Optimally indexed on compound combinations `[companyId]`, `[dateStr]` and `[city]` to compile instantaneous global financial ledgers.

---

## 📦 Containerized Setup & Deployment

### Infrastructure Deployment (Docker Compose)
We maintain a production-ready containerized service mesh encapsulating the Node API Gateway, WebSocket engine, PostgreSQL master, and Redis cluster.

Create a `docker-compose.yml` inside the `/server` folder:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: night-db
    restart: always
    environment:
      POSTGRES_USER: logistix_admin
      POSTGRES_PASSWORD: SecretProductionDbPass!
      POSTGRES_DB: logistix_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U logistix_admin -d logistix_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: night-cache
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    command: redis-server --appendonly yes --requirepass SecretProductionRedisPass!
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "SecretProductionRedisPass!", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: .
    container_name: night-server
    restart: always
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DATABASE_URL: "postgresql://logistix_admin:SecretProductionDbPass!@postgres:5432/logistix_db?schema=public"
      REDIS_URL: "redis://:SecretProductionRedisPass!@redis:6379"
      JWT_SECRET: "NighthaulSchengenSecureEncryptionKey2026!"
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  pgdata:
  redisdata:
```

### Server Production Dockerfile
Create a `Dockerfile` inside the `/server` folder:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
```

### Launching Backend Services
To build and launch the database, cache, and Express backend:
```bash
cd server
# Deploy database, cache and build API containers
docker compose up -d --build

# Run database migrations to construct tables & indices
docker compose exec backend npx prisma migrate deploy

# Seed initial commodities, legal cargo catalogs, and starting routes
docker compose exec backend npm run seed
```

---

## 🛠 Multi-Platform Client Compilation

The Godot 4.3 game client utilizes GLES3 (Compatibility renderer) to run on low-spec PCs, retro consoles, and mobile devices.

### 1. Windows & Linux Builds
*   Install the Godot 4.3 SDK and download the standard export templates.
*   Configure export presets inside `client/export_presets.cfg` specifying:
    - Target: Windows (Desktop) or Linux (X11)
    - Texture compression: ETC2 / ASTC (Desktop standard)
*   Build via CLI:
    ```bash
    # Headless Windows build
    godot --headless --export-release "Windows Desktop" build/LogistiXpert.exe
    
    # Headless Linux build
    godot --headless --export-release "Linux" build/LogistiXpert.x86_64
    ```

### 2. Android (ARM64 SDK 34) Build
*   Download and install Android Studio alongside Android SDK Platform 34 and Build Tools.
*   Inside Godot Editor Preferences, set paths to `adb`, `jarsigner`, and Android SDK.
*   Generate a secure debug/release keystore:
    ```bash
    keytool -genkey -v -keystore logistix.keystore -alias logistix_key -keyalg RSA -keysize 2048 -validity 10000
    ```
*   In Godot's export screen, choose **Android (Runnable)**:
    - Set Target SDK to `34` (Android 14) and Minimum SDK to `21`.
    - Check **Permissions** -> `Internet` (MANDATORY for WebSocket connections).
    - Feed custom credentials inside the Keystore Release fields.
*   Compile package:
    ```bash
    godot --headless --export-release "Android" build/LogistiXpert.apk
    ```

---

## 🔌 Core Protocol Specifications

### REST APIs (HTTP Server Gateway)

| Verb | Path | Auth Required | Request Payload | Response (200 OK) |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | No | `{ "username": "...", "password": "...", "companyName": "..." }` | `{ "user": {...}, "token": "JWT" }` |
| `POST` | `/api/auth/login` | No | `{ "username": "...", "password": "..." }` | `{ "user": {...}, "token": "JWT" }` |
| `GET` | `/api/garage` | Yes | — | `[ { "id": "...", "name": "...", "trucks": [...] } ]` |
| `POST` | `/api/dispatch/launch` | Yes | `{ "truckId": "...", "driverId": "...", "routeId": "...", "contraband": boolean }` | `{ "route": {...}, "message": "En-route" }` |
| `POST` | `/api/laundry/launder` | Yes | `{ "frontId": "...", "dirtyAmount": 5000 }` | `{ "cleanCash": 4250, "ratio": 0.85 }` |

### Raw WebSocket Real-Time Events (ws Server)

Handshakes must establish an authenticated query parameter: `ws://127.0.0.1:3000/ws?token=JWT_TOKEN`

#### 1. Server → Client Telemetry & Alerts

##### `route:progress` — Real-Time GPS Tracking & ECU diagnostics
```json
{
  "type": "route:progress",
  "payload": {
    "routeId": "route_99a82bb",
    "progressPct": 42.6,
    "fatigueHours": 8.4,
    "tachoViolation": false,
    "fuelLitres": 284.1,
    "engineHealth": 94,
    "currentCity": "Warsaw"
  }
}
```

##### `border:inspection_started` — Paused at Customs
```json
{
  "type": "border:inspection_started",
  "payload": {
    "routeId": "route_99a82bb",
    "borderName": "Brest-Terespol Border Checkpoint",
    "baseScanRiskPct": 65.0,
    "bribeDemandDirty": 3200
  }
}
```

##### `auction:bid_update` — Multi-player Auction Ledger Tick
```json
{
  "type": "auction:bid_update",
  "payload": {
    "auctionId": "auc_f5421a2",
    "currentBid": 24500.0,
    "totalBids": 14,
    "highestBidderCompanyId": "comp_339b1a8",
    "highestBidderCompanyName": "Valhalla Freighters"
  }
}
```

#### 2. Client → Server Actions

##### `auction:place_bid` — Atomic Bid Submission
```json
{
  "type": "auction:place_bid",
  "payload": {
    "auctionId": "auc_f5421a2",
    "amount": 25000.0
  }
}
```

##### `border:resolve_inspection` — Tactical Decisions
```json
{
  "type": "border:resolve_inspection",
  "payload": {
    "routeId": "route_99a82bb",
    "decision": "BRIBE" // "SCAN" | "BRIBE" | "RUN"
  }
}
```

---

## 🧪 Integration Testing Suite

Our backend ships with a highly defensive, 100% complete Express+Prisma contract and simulation testing harness using Jest and Supertest.

To run the full simulation and REST validation suites:
```bash
cd server
npm run test
```

Ensure all tests return green status codes and zero connection dropbacks.
