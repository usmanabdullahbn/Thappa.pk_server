# Thappa Backend

Node.js + Express + TypeScript + MongoDB (Mongoose) API implementing the
architecture in the Thappa Technical Guide.

## What's implemented

- **Auth**: Phone OTP (mocked — printed to console instead of sent as SMS),
  Google sign-in (dev stub — accepts an already-obtained email/name), and
  email+password login for Business/Admin staff.
- **Admin**: create/list/suspend businesses, platform-wide KPIs.
- **Business**: branch management, staff invites, dynamic QR generation
  (Mode A), customer list, manual stamp adjustment, redemption-code
  verification, basic analytics.
- **Customer**: stamp cards, the core `redeem-qr` scan-to-earn endpoint
  (supports both Mode A signed-QR and Mode B geofenced static QR), reward
  redemption codes, nearby-business discovery.
- **QR anti-fraud**: signed, single-use, short-lived JWTs (Mode A) backed by
  a Mongo TTL-indexed `qrTokens` collection; geofence + cooldown (Mode B).
- **Security**: JWT auth + RBAC middleware, bcrypt password hashing, rate
  limiting on auth/scan endpoints, Zod request validation, Mongo transactions
  for atomic stamp writes.

## What's intentionally stubbed (swap before production)

- **Phone OTP delivery** — currently logged to the server console
  (`src/utils/otpStore.ts`). Replace with Firebase Phone Auth (client sends
  the SMS; backend verifies the resulting Firebase ID token) or Twilio/MSG91 + Redis.
- **Google sign-in** — currently trusts a client-submitted `{ email, name }`.
  Replace with verification of a real Google ID token
  (`google-auth-library` or Firebase Admin SDK) in
  `src/modules/auth/auth.service.ts`.
- **Payments/subscriptions** — intentionally out of scope; owned by the
  sales/business team per the Technical Guide.

## Getting started

```bash
cp .env.example .env      # edit values as needed
npm install
npm run seed               # creates the first ADMIN account (see .env)
npm run dev                 # starts the API on http://localhost:4000
```

Requires a running MongoDB instance (local `mongod`, Docker, or MongoDB Atlas).
Update `MONGODB_URI` in `.env` accordingly.

## Project layout

```
src/
├── config/        # env.ts, db.ts
├── models/        # Mongoose schemas
├── middleware/     # auth, RBAC, rate limiting, validation, error handling
├── modules/
│   ├── auth/        # sign-up/login flows
│   ├── admin/         # business onboarding + platform analytics
│   ├── business/        # branches, staff, QR generation, customers
│   ├── customer/          # stamp cards, scan-to-earn, redemptions
│   └── qr/                  # shared QR generate/verify logic
├── utils/            # jwt.ts, sixDigitCode.ts, haversine.ts, otpStore.ts
├── app.ts             # Express app + route wiring
├── server.ts           # HTTP server bootstrap + Socket.IO
└── seed.ts               # creates the first admin account
```

## Quick smoke test (after `npm run dev`)

```bash
# 1. Admin logs in
curl -X POST http://localhost:4000/v1/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@thappa.in","password":"ChangeMe123!"}'

# 2. Admin creates a business (use the accessToken from step 1)
curl -X POST http://localhost:4000/v1/admin/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -d '{
    "businessName": "Cafe Mocha",
    "ownerName": "Ali Khan",
    "ownerEmail": "ali@cafemocha.pk",
    "ownerPassword": "CafePass123",
    "branchName": "Cafe Mocha - Clifton",
    "lat": 24.8138, "lng": 67.0299
  }'

# 3. Business owner logs in
curl -X POST http://localhost:4000/v1/auth/business-login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@cafemocha.pk","password":"CafePass123"}'

# 4. Business generates a stamp QR for the branch (use the returned branch._id)
curl -X POST http://localhost:4000/v1/business/qr/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <BUSINESS_ACCESS_TOKEN>" \
  -d '{"branchId": "<BRANCH_ID>"}'

# 5. Customer signs up via phone OTP (check server console for the printed OTP)
curl -X POST http://localhost:4000/v1/auth/otp/send \
  -H "Content-Type: application/json" -d '{"phone":"+923001234567"}'

curl -X POST http://localhost:4000/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001234567","otp":"<OTP_FROM_CONSOLE>","name":"Sana"}'

# 6. Customer scans the QR to earn a stamp (use qrToken from step 4)
curl -X POST http://localhost:4000/v1/customer/stamps/redeem-qr \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CUSTOMER_ACCESS_TOKEN>" \
  -d '{"qrToken": "<QR_TOKEN>"}'
```
