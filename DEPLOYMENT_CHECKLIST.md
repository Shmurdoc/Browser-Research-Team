# Deployment Checklist: Design Pattern Multiverse → OpenCode MCP Plugin

## Pre-Deployment Verification

- [ ] `npm run build` → 0 errors
- [ ] `npm test` → 55/55 passing
- [ ] `npm run mcp-server` → starts without errors
- [ ] MCP tools respond to test calls
- [ ] Logs are being written to `logs/dpm-*.log`
- [ ] `.env.example` is complete
- [ ] `OPENCODE_INTEGRATION.md` is clear
- [ ] `QUICKSTART_OPENCODE.md` is clear
- [ ] `plugin.json` is valid
- [ ] No secrets in git
- [ ] Ready to share with OpenCode users

## MCP Server Readiness

| Check | Status | Notes |
|-------|--------|-------|
| Transport | stdio | ✅ Correct for MCP plugin model |
| Tools registered | 8/8 | search, discover, submit, get, rate, generate, stats, suggest |
| Error handling | ✅ | try-catch on all handlers + fatal error handler |
| Startup logging | ✅ | `[dpm]` prefix on stderr |
| SONA learning init | ✅ | `initSONA({ adaptationRate: 0.15 })` |
| Vector index rebuild | ✅ | Loads patterns from storage on startup |
| Build output | `dist/mcp-server/index.js` | ✅ Valid JS output |

## Plugin Manifest Validation

- `plugin.json` name: `design-pattern-multiverse`
- Version: `1.0.0` (match package.json for release)
- Transport: `stdio`
- Tools: `8`
- Capabilities: `search`, `discover`, `submit`, `retrieve`, `rate`, `generate_code`, `stats`, `suggest`

## Environment Configuration

- [ ] `DPM_LOG_LEVEL` defaults to `info`
- [ ] `DPM_STORAGE_DIR` defaults to `./patterns`
- [ ] Optional API keys documented (`PIN_API_KEY`, `FIGMA_ACCESS_TOKEN`)
- [ ] Warning about `.env` not being committed

## Integration Files

- [ ] `OPENCODE_INTEGRATION.md` — comprehensive user guide
- [ ] `QUICKSTART_OPENCODE.md` — 5-minute setup guide
- [ ] `scripts/start-mcp.bat` — Windows launcher
- [ ] `scripts/start-mcp.sh` — Unix launcher
- [ ] `plugin.json` — MCP plugin manifest

## Final Sign-Off

| Role | Status |
|------|--------|
| Build | ⬜ |
| Tests | ⬜ |
| MCP Server | ⬜ |
| Documentation | ⬜ |
| Security Review | ⬜ |

**Deployed by:** _________________ **Date:** _________________

---

*See [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) for usage instructions.*
*See [QUICKSTART_OPENCODE.md](./QUICKSTART_OPENCODE.md) for rapid setup.*
