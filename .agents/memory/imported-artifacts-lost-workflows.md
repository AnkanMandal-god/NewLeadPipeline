---
name: Imported projects can have orphaned artifact.toml files
description: After a GitHub import/export round trip, artifacts/<slug>/.replit-artifact/artifact.toml files can exist on disk (committed to git) while the platform's live registration (listArtifacts(), .replit workflow entries) is empty/missing.
---

## Symptom
- `listArtifacts()` returns `[]` even though `artifacts/<slug>/.replit-artifact/artifact.toml` exists and looks complete.
- `.replit` has no `[[workflows.workflow]]` entry for that service, and `WorkflowsRestart` with the documented managed name (`artifacts/<slug>: <service>`) fails with "doesn't exist in config".
- `createArtifact()` can't be used to fix it — it refuses to run against an existing `artifacts/<slug>/` directory.

## Fix that worked
Call the `configureWorkflow` callback directly (normally discouraged for artifact services) with a workflow **name matching the exact managed pattern** `artifacts/<slug>: <service-name>` from the toml, and a command that manually exports the env vars the toml's `[services.env]` / `[services.development]` sections declare (e.g. `PORT`, `BASE_PATH`) before running the toml's `run` command. Example:

```js
await configureWorkflow({
  name: "artifacts/dashboard: web",
  command: "cd artifacts/dashboard && PORT=23183 BASE_PATH=/dashboard/ pnpm run dev",
  waitForPort: 23183,
  outputType: "webview",
  autoStart: true
});
```

This both starts the process AND appears to re-register proxy path routing (verified via `curl` to the artifact's `previewPath` returning 200) — the proxy seems to route based on `artifact.toml` files on disk, not solely on the `listArtifacts()` index. `waitForPort` accepted a non-standard port (23183) outside the usual configureWorkflow allowed-port list without error.

**Why:** Replit's per-session artifact tracking metadata doesn't survive a GitHub export → reimport round trip, but the committed `artifact.toml` files and code do. There's no dedicated "reconcile/reimport artifacts" callback as of 2026-07.

**How to apply:** When `listArtifacts()` is empty but `artifacts/*/.replit-artifact/artifact.toml` files exist in an imported project, use this `configureWorkflow` workaround per missing service instead of trying to recreate the artifact from scratch.
