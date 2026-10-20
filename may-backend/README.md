# MAY API — Local PostgreSQL Academic Prototype

Node.js + Express REST API; PostgreSQL database. Use the archive root's
`MAY-REVISION-01-START-HERE.md` for setup and the full demonstration workflow.

Required local backend `.env` (do not commit real credentials):

```env
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_DATABASE
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
NODE_ENV=development
```

Install and run: `npm ci`, `npm run migrate`, `npm test`, `npm run dev`.
Migration is additive and repeatable. Existing locally migrated data is retained.

### Passenger API

- `GET /api/rides/nearby-drivers?lat=...&lng=...`
- `GET /api/rides/available-cabs?lat=...&lng=...&dropoffLat=...&dropoffLng=...&bookingMode=Sharing&category=Standard`
- `POST /api/rides/book` with `pickup`, `dropoff`, `pickupLat`, `pickupLng`, `dropoffLat`, `dropoffLng`, `driverId`, `bookingMode`, and `pricingCategory: "Standard"`
- `PATCH /api/rides/cancel/:id` — Pending bookings only
- `GET /api/rides/my-rides`
- `POST /api/rides/safe-arrival/:id` — driver's arrival confirmation required first
- `POST /api/rides/emergency` — flags a ride, **not live emergency dispatch**

### Driver API

`GET /api/driver/profile`, `PATCH /api/driver/profile`, `GET /api/driver/rides`,
`PATCH /api/driver/availability`, `PATCH /api/driver/location`,
`PATCH /api/driver/start-ride/:id`, `PATCH /api/driver/end-ride/:id`.

### Admin API

`GET /api/admin/drivers`, `PATCH /api/admin/approve-driver/:id`,
`GET /api/admin/rides`, `GET /api/admin/users`.

All ride/driver/admin endpoints require a JWT bearer token and the expected role.

Demo Sharing fare: **N$15 per passenger**. Solo fare: **N$30**.
The prototype's shared-route compatibility is based on pickup/destination proximity.
Never represent proximity matching as a full route-optimization engine.

The current Socket.IO interface requires `auth: { token }` on connection and
checks membership before joining ride rooms. Browser cross-origin access can be
configured via `SOCKET_ALLOWED_ORIGIN`; no mobile Socket.IO client is wired yet.
