# MAY Backend API — v2.0 (PostgreSQL / Supabase)

Backend for **May: Safe for Her** — a women's safety-focused e-hailing platform.
Migrated from MongoDB/Mongoose to **PostgreSQL via Supabase** to align with the
research proposal (Student No: 221145672 — *Enhancing Safety in Namibian Urban E-hailing Services*).

---

## Tech Stack

| Layer        | Technology                     |
|--------------|-------------------------------|
| Server       | Node.js + Express.js           |
| Database     | PostgreSQL via Supabase (`pg`) |
| Auth         | JWT + bcrypt                   |
| Real-time    | Socket.IO (GPS tracking)       |
| Security     | Helmet, CORS, role middleware  |

---

## Setup

### 1. Prerequisites
- Node.js ≥ 18
- A Supabase project (free tier works): https://supabase.com

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```
PORT=5000
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
JWT_SECRET=your_strong_secret_here
NODE_ENV=development
```

Your `DATABASE_URL` is found in Supabase → Project Settings → Database → Connection String (URI).

### 3. Install dependencies

```bash
npm install
```

### 4. Run database migration

Creates the `users`, `drivers`, and `rides` tables:

```bash
npm run migrate
```

### 5. Start the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

---

## API Endpoints

### Auth
| Method | Endpoint               | Access  | Description            |
|--------|------------------------|---------|------------------------|
| POST   | /api/auth/register     | Public  | Register user          |
| POST   | /api/auth/login        | Public  | Login, returns JWT     |

### Rides (Passenger)
| Method | Endpoint                    | Access     | Description              |
|--------|-----------------------------|------------|--------------------------|
| POST   | /api/rides/book             | Passenger  | Book a ride              |
| POST   | /api/rides/safe-arrival/:id | Passenger  | Submit safe arrival code |
| GET    | /api/rides/my-rides         | Passenger  | View own ride history    |
| POST   | /api/rides/emergency        | Passenger  | Trigger emergency alert  |

### Driver
| Method | Endpoint                    | Access  | Description        |
|--------|-----------------------------|---------|--------------------|
| GET    | /api/driver/rides           | Driver  | Assigned rides     |
| PATCH  | /api/driver/start-ride/:id  | Driver  | Start a ride       |
| PATCH  | /api/driver/end-ride/:id    | Driver  | Complete a ride    |

### Admin
| Method | Endpoint                       | Access | Description          |
|--------|--------------------------------|--------|----------------------|
| GET    | /api/admin/drivers             | Admin  | All drivers          |
| PATCH  | /api/admin/approve-driver/:id  | Admin  | Approve/reject driver|
| GET    | /api/admin/rides               | Admin  | All rides            |
| GET    | /api/admin/users               | Admin  | All users            |

---

## Real-time (Socket.IO)

| Event              | Direction       | Payload                      |
|--------------------|-----------------|------------------------------|
| `join:ride`        | Client → Server | `rideId`                     |
| `driver:location`  | Driver → Server | `{ rideId, lat, lng }`       |
| `location:update`  | Server → Client | `{ lat, lng, timestamp }`    |

---

## Data Retention

Ride records include an `expires_at` column set to **62 hours** from booking,
consistent with the research proposal's data privacy policy.

---

## Roadmap

- [ ] Twilio IRT emergency alert integration
- [ ] AI route anomaly detection
- [ ] Payment gateway (MTC MoMo)
- [ ] School portal subscription tier
- [ ] Admin analytics dashboard
