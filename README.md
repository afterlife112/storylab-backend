# api-server

Node.js + TypeScript REST API for KOL Mission Hub.

## Features

- JWT auth (access token + refresh token cookie)
- Role-based access control (`ADMIN`, `MERCHANT`, `INFLUENCER`)
- Prisma + PostgreSQL schema for missions, wallets, points, withdrawals, chat, disputes, audit logs
- Multer upload validation (`png/jpg/webp`, max 5MB)
- Revenue Monster webhook verification without any local mock payment runtime path
- Rate limiting, Helmet, CORS credentials support for 3 frontend origins
- Zod request validation and unified response format: `{ success, data, error }`

## Setup

```bash
pnpm i
cp .env.example .env
pnpm prisma migrate dev
pnpm dev
```

## Key routes

- `/auth`
- `/merchant`
- `/influencer`
- `/admin`
- `/public`
- `/webhooks/revenue-monster`

## Runtime data

This backend is expected to use only the live PostgreSQL database configured by `DATABASE_URL`.
No local seed/bootstrap runtime path is part of normal backend execution.
