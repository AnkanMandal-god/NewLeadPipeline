---
name: uv add permission-denied on fresh container
description: installLanguagePackages({language:"python"}) / `uv add` can fail with "Permission denied" writing into the nix store's site-packages on a freshly-restarted container, even though UV_PROJECT_ENVIRONMENT correctly points at .pythonlibs.
---

## Symptom
`uv add <pkgs>` (via `installLanguagePackages`) fails with e.g.:
```
error: Failed to install: httpx-0.28.1-py3-none-any.whl (httpx==0.28.1)
  Caused by: failed to create directory `/nix/store/.../python3.11/site-packages/httpx`: Permission denied (os error 13)
```
even though `pyproject.toml` already lists the package as a dependency and `UV_PROJECT_ENVIRONMENT=/home/runner/workspace/.pythonlibs` is set correctly.

## Fix that worked
Running a plain `python3 -m pip install <pkgs>` first (writes into `.pythonlibs` via `PYTHONUSERBASE`) got the packages importable immediately, and a subsequent `uv add` of the same packages then either succeeds or is redundant since they're already present. Verify with `python3 -c "import <pkg>"` rather than trusting the `uv add` exit code alone.

**Why:** unclear root cause (looked like a stale/inconsistent venv state after a container restart wiped `node_modules`/`.pythonlibs` contents but not the `pyproject.toml` dependency list) — but the workaround reliably unblocks it.

**How to apply:** if `installLanguagePackages({language:"python"})` fails with a nix-store permission error on packages already declared in `pyproject.toml`, try a direct `python3 -m pip install <pkgs>` via ShellExec and re-verify imports before treating it as a hard blocker.
