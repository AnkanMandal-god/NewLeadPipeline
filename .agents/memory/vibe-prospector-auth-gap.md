---
name: Vibe Prospector auth gap
description: The Vibe Prospector API server requires a logged-in session on every /api route, but the imported dashboard had no login page — the app was unusable until a login page and a seeded admin account were added.
---

## Symptom
- Every dashboard page loads its shell fine but data widgets stay stuck on loading skeletons forever.
- `curl`ing any `/api/*` route (other than `/api/health*` and `/api/auth/*`) returns `{"error":"Not authenticated"}`.
- No `login`/`signin` page or component exists anywhere under the dashboard's `src/pages`.

## Root cause
`artifacts/api-server/src/routes/index.ts` mounts `requireAuth` globally before the leads/settings/batches/pipeline routers. `artifacts/api-server/src/routes/auth.ts` supports login/logout/me/user-management, but nothing seeds an initial account, and the dashboard's `App.tsx` rendered the router directly with no auth gate or sign-in UI.

## Fix that worked
1. Seed one admin account directly against MongoDB (bcrypt-hash a password, insert into the `users` collection, bump the `counters` collection's `users` sequence) — there is no bootstrap/seed script in the repo.
2. Add a dashboard login page (`artifacts/dashboard/src/pages/login.tsx`) using the already-generated `useLogin`/`useGetMe` hooks from `@workspace/api-client-react`.
3. Wrap the router in `App.tsx` with an `AuthGate` component: call `useGetMe()`, render `<Login />` on error/no-data, otherwise render the app. Session cookies work automatically since dashboard and API are same-origin through the path proxy — no `credentials: "include"` needed.

**Why:** the app is genuinely unusable as imported without this — not a config/env issue, a missing feature in the imported code.

**How to apply:** when an imported app's API enforces auth but the frontend has no way to authenticate, check for a `login`/`useLogin` hook already generated from the OpenAPI spec before writing one from scratch — it usually already exists and just needs a page + auth gate wired up.
