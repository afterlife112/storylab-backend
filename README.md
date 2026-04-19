# api-server

Node.js + TypeScript REST API for KOL Mission Hub.

## Features

- JWT auth (access token + refresh token cookie)
- Role-based access control (`ADMIN`, `MERCHANT`, `INFLUENCER`)
- Prisma + PostgreSQL schema for missions, wallets, points, withdrawals, chat, disputes, audit logs
- Multer upload validation (`png/jpg/webp`, max 5MB)
- Revenue Monster adapter with mock topup flow and webhook endpoint
- Rate limiting, Helmet, CORS credentials support for 3 frontend origins
- Zod request validation and unified response format: `{ success, data, error }`

## Setup

```bash
pnpm i
cp .env.example .env
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

## End-to-end verification

Run complete role flow checks (merchant + influencer + admin):

```bash
pnpm test:e2e
```

## Key routes

- `/auth`
- `/merchant`
- `/influencer`
- `/admin`
- `/public`
- `/webhooks/revenue-monster`
- `/dev/mock-pay/:referenceId`

## Seed accounts

- Admin: `admin@kolhub.my` / `Password123!`
- Merchant: `merchant1@kolhub.my` / `Password123!`
- Influencer: `influencer1@kolhub.my` / `Password123!`
