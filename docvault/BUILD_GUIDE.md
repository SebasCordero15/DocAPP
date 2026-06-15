# DocVault — Build Guide for Claude Code

This is the spec to continue building DocVault inside Claude Code on your own
machine. Hand this file (and the repo) to Claude Code and work through the
phases in order. Each phase is a self-contained, testable unit.

## Context to give Claude Code at the start

> I'm building DocVault, a multi-tenant, white-label document management
> platform. Stack: Next.js (App Router) + Prisma + PostgreSQL + TypeScript.
> The scaffold already has: the multi-tenant Prisma schema, bcrypt+JWT auth,
> a backend permissions engine with folder→file inheritance, audit logging,
> and a seeded demo with two companies. Read README.md and prisma/schema.prisma
> first. Then continue with the phase I specify. Enforce every permission check
> on the backend; the frontend only hides controls for UX.

## Core principles (do not violate)

1. **Tenant isolation**: every query must be scoped by `companyId`. Never let
   one company read another's data. Derive `companyId` from the session, never
   from client input.
2. **Backend authorization**: use `requireFileAccess` / `resolveFolderAccess`
   before any read/write. Hiding a button in the UI is not security.
3. **Files in object storage, metadata in Postgres**: never store file bytes in
   the database.
4. **Signed URLs**: file access uses short-lived signed URLs, never permanent
   public links.
5. **Audit everything**: call `logAction` for uploads, edits, moves, deletes,
   permission changes, and logins.

## Phase 2 — Files & Folders (continue here)

- [ ] API routes: create/rename/move/delete folders (scoped by company, checked by permission).
- [ ] API routes: list folder contents (folders + files the user can at least READ).
- [ ] File upload: generate a pre-signed PUT URL from object storage; client uploads directly; then save metadata.
- [ ] File download: generate a short-lived signed GET URL after an access check.
- [ ] Soft delete (trash) before hard delete.
- [ ] Object storage: use AWS S3 or Cloudflare R2. For local dev, MinIO works as an S3-compatible server in Docker.
- [ ] Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.

Suggested env additions:
```
S3_ENDPOINT=...        # e.g. MinIO http://localhost:9000 for local
S3_REGION=auto
S3_BUCKET=docvault
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## Phase 3 — Permissions UI

- [ ] Admin screen: pick a folder/file, pick a user, set NONE/READ/EDIT/MANAGE.
- [ ] Show effective (inherited vs explicit) access clearly.
- [ ] Wire `resolveFolderAccess`/`resolveFileAccess` into every file/folder API route.
- [ ] Tests: a VIEWER cannot upload; a NONE user cannot list or download; inheritance resolves to the nearest ancestor; an explicit file permission overrides the folder.

## Phase 4 — Audit log & Notifications

- [ ] Audit log viewer (admin only), filterable by user/action/date.
- [ ] In-app notification feed (bell icon, unread count).
- [ ] Email via Resend (`RESEND_API_KEY`).
- [ ] Let admins set `reviewDueDate` + `assignedToId` on a file.
- [ ] Scheduled job (daily): find files with `reviewDueDate` within a warning
      window (e.g. 30/7/1 days), create notifications, send emails to the
      assignee and the company admins. On a recurring cycle, set the next due
      date when one is completed.
- [ ] For local dev, a simple cron route hit by a scheduler works; in production
      use Vercel Cron or a worker.

## Phase 5 — Hardening & launch

- [ ] Add `middleware.ts` to protect `/dashboard/**` routes (redirect to /login).
- [ ] Rate-limit the login route.
- [ ] Add MFA for admins (optional, can use the auth provider).
- [ ] Input validation with zod on every API route.
- [ ] File upload validation (type, size limits); virus scanning if feasible.
- [ ] Daily DB backups; test a restore.
- [ ] Security headers (CSP, HSTS).
- [ ] Switch sessions to `secure` cookies (already conditional on NODE_ENV).
- [ ] Consider moving auth to Clerk or Auth.js if you want managed MFA/SSO.

## Phase 6 — Polish & multi-tenant routing

- [ ] Subdomain or path-based tenant routing (e.g. `acme.docvault.app` or `/acme`).
- [ ] Company settings screen: upload logo, set primary color (white-label).
- [ ] Apply branding via CSS variables driven by the company record.
- [ ] Empty states, loading states, error boundaries.

## Testing checklist before launch

- [ ] Two companies cannot see each other's folders, files, users, or logs.
- [ ] Each role behaves correctly (ADMIN/EDITOR/VIEWER).
- [ ] Permission inheritance and overrides verified with automated tests.
- [ ] All file access goes through signed URLs.
- [ ] Audit log captures every sensitive action.
- [ ] Notifications fire at the right time.
- [ ] Backups run and restore cleanly.

## Notes on the auth choice

The scaffold uses a lightweight self-managed auth (bcrypt + jose JWT) so it runs
with zero external dependencies for local testing. For production you may prefer
Clerk or Auth.js for managed MFA, SSO, and account recovery — swap it in during
Phase 5. Keep the per-company email uniqueness rule either way.
