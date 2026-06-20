# DocVault

Secure, multi-tenant, white-label document management platform.
Built with Next.js (App Router) + Prisma + PostgreSQL + TypeScript.

## What's in this scaffold

- **Multi-tenant data model** — every table is scoped by `companyId`; companies are fully isolated.
- **White-label theming** — each company stores its own `name`, `logoUrl`, and `primaryColor`; the UI reads them at runtime. No per-client code.
- **Authentication** — email/password with bcrypt hashing and signed JWT session cookies. Email is unique *per company*, so different companies can reuse an address.
- **Roles** — ADMIN / EDITOR / VIEWER.
- **Permissions engine** (`src/lib/permissions.ts`) — per-user access levels (NONE/READ/EDIT/MANAGE) on folders and files, with folder→file inheritance and nearest-ancestor resolution. ADMINs always get MANAGE. Enforced on the backend.
- **Audit logging** (`src/lib/audit.ts`).
- **Schema-ready notifications** — `reviewDueDate` + `assignedToId` on files, and a `Notification` table, ready for the scheduled job.
- **Seed data** — two demo companies (Acme, Globex) to demonstrate isolation and theming.

## Prerequisites

- Node.js 18+ and npm
- A PostgreSQL database (local install, Docker, or a free cloud tier like Neon/Supabase)

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   - set DATABASE_URL to your Postgres connection string
#   - set AUTH_SECRET to a long random string (e.g. `openssl rand -base64 32`)

# 3. Generate the Prisma client + create the schema in your DB
npm run db:generate
npm run db:push

# 4. Seed demo data
npm run db:seed

# 5. Run it
npm run dev
```

Open http://localhost:3000 and sign in with:

- Company: `acme`  Email: `admin@acme.com`  Password: `password123`

Try `globex` / `admin@globex.com` / `password123` to see a different tenant with its own brand color.

> Note: `npm run db:generate` downloads the Prisma query engine. This needs
> internet access the first time — it cannot run in a restricted sandbox, but
> works normally on your machine.

## Project structure

```
prisma/
  schema.prisma     # data model (tenancy, users, folders, files, permissions, audit, notifications)
  seed.ts           # demo companies + users
src/
  lib/
    prisma.ts       # client singleton
    auth.ts         # password hashing + JWT sessions
    permissions.ts  # the access-control engine (inheritance + enforcement)
    audit.ts        # action logging
  app/
    page.tsx              # landing
    login/page.tsx        # login UI
    dashboard/page.tsx    # themed dashboard (reads company branding)
    api/auth/login        # login endpoint
    api/auth/logout       # logout endpoint
```

See `BUILD_GUIDE.md` for the roadmap to continue the build in Claude Code.
