Handsoff — Design Pattern Multiverse
===================================

Purpose
-------
This document explains what the repository is, how it is built, how to run it, and the operational runbook required to operate, maintain, and extend the Design Pattern Multiverse in production. It is intended to be a single-stop reference for engineers and on-call operators taking over this project.

High-level goal
----------------
- Discover UI design patterns from the web, analyze them (vision + heuristics), index them (vector + token search), and generate production-ready component code.
- Run safely and reliably in production: authenticated APIs, SSRF/XSS protections, rate limiting, input validation, atomic persistence, observability, and CI enforcement of quality and security gates.

Architecture overview
---------------------
- Web server (src/web-server): serves UI and JSON APIs (/api/*). Enforces auth, rate limiting, CSP, CORS, and Zod validation.
- Storage layer (src/storage): local JSON storage is the default (atomic writes + write-lock). Optional Supabase adapter available.
- Memory & embeddings (src/memory): agentdb and sona for vector memory, embedding pipeline, and search.
- Swarm (src/swarm): scouts (scanners for Pinterest/Dribbble/Behance/Figma), browser pool, vision analysis, and pattern curator.
- Codegen (src/swarm/pattern): transforms patterns into component code and templates.
- Tests (tests/): unit and integration tests; CI runs lint, typecheck, unit tests, Playwright E2E.

Key constraints and security posture
----------------------------------
- All endpoints validated with Zod and protected by API key middleware (DPM_WEB_KEY) unless intentionally left unconfigured for local dev.
- SSRF defenses: URL allowlist (http(s) only), private IP ranges blocked, cloud metadata endpoints blocked (src/validation/url.ts).
- XSS defenses: escape all dynamic UI content, server-side sanitization (src/validation/sanitize.ts).
- Rate limiting: token-bucket per-IP enforced on web routes.
- Storage: atomic write semantics and write-lock to prevent race conditions.
- Model and secrets: LLM/embedding keys read from env only; never logged. Follow rotating keys policy.
- Follow PROJECT_MADOC non-negotiable rules (see SECURITY in this repo).

Environment variables
---------------------
- DPM_WEB_KEY: API key for /api routes. If empty, server runs in relaxed dev mode (not recommended for prod).
- DPM_ALLOWED_ORIGINS: comma-separated list for CORS.
- DPM_LOG_LEVEL: log level (info|warn|error|debug).
- DPM_USE_SUPABASE: if "1", use Supabase storage adapter (requires SUPABASE_URL, SUPABASE_KEY).
- PORT: server port (default 3000).
- NODE_ENV: development|production|test.

How to run locally
-------------------
1. Install dependencies: `npm ci`
2. Build: `npm run build`
3. Run tests: `npm test`
4. Run dev server: `npm run web` (or `node dist/src/web-server/index.js`)
5. Docker: `docker compose up --build`

Deployment
----------
- Production recommendation: multi-stage Docker image (see Dockerfile). Run behind a reverse proxy (TLS termination), enable HSTS and CSP headers at app and proxy level.
- Use docker-compose for single-host deployments or package into your container registry for Kubernetes/Fargate.
- Health checks: HTTP GET /health and /ready. Compose and orchestration should poll /ready to confirm startup.

CI and quality gates
--------------------
- CI runs: lint (ruff/eslint), typecheck (tsc/pyright), unit tests, Playwright E2E for critical journeys, and security scans (Semgrep/Trivy).
- PROJECT_MADOC G1-G7 must pass before merge to main. CI is configured to fail on critical Semgrep/Trivy findings.

Operational runbook (on-call quick actions)
-----------------------------------------
- Service down (no response):
  - Check host/container status: `docker ps` and `docker logs <container>`.
  - Confirm /health responds; if not, check logs for crashes or repeated OOMs.
  - If memory/CPU exhausted, scale containers or increase resource limits. Investigate embedding/LLM batch jobs.
- API key rotation:
  - Generate new key, update `DPM_WEB_KEY` in environment, restart service. Revoke old key after rollout.
- Export data (for recovery/migration):
  - Use `GET /api/export` to dump current patterns library (JSON). Save to secure storage.
- Restore data:
  - Upload via `src/storage` restore script (not public by default). If missing, contact original author.
- Partial outage (errors for specific flows like scouts):
  - Check `src/swarm/scout/browser` logs for browser pool errors.
  - Ensure Playwright/Chrome dependencies are present if running headful scraping.
- Security incident (suspected breach):
  - Rotate all API and LLM keys immediately.
  - Snapshot logs and export DB via `/api/export`.
  - Run `npm audit` and SCA tools; escalate to security lead within 1 hour.

Backups & DR
-----------
- Regularly snapshot `patterns/` directory (or Supabase backup) to offsite storage. Keep at least 3 rolling snapshots.
- Automate snapshot job (outside repo) and verify restoration monthly.

Open tasks (priority order)
--------------------------
1. Add handsoff.md (this file) — done.
2. Tests: add unit/integration tests for the 9 critical modules (agentdb, memory/sona, reasoning-bank, swarm/router, consensus, scout/browser, swarm/vision/analyze, curator, web-server integration). High priority.
3. Observability: add structured logging (pino), `/metrics` for Prometheus, and Sentry integration.
4. CI: enable Semgrep/Trivy and fail on criticals; pin and hash critical deps.
5. API: generate OpenAPI spec for all endpoints and publish as `openapi.yaml`.

Suggested immediate next step
----------------------------
Implement the tests for the highest-risk modules (agentdb and swarm/scout/browser). This reduces the single biggest blocker to declaring the repo production-ready. If you want, I will start by adding unit tests for `src/memory/agentdb.ts` and update CI accordingly.

Contact & ownership
-------------------
- Current maintainer: repository owner (see Git history). If you need access to secrets or infra, ask the owner or escalate to the Platform team.

Where this file lives
---------------------
`handsoff.md` (root of repository)

End of file
