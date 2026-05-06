# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run watch        # Compile in watch mode
npm test             # Build first, then: node --test dist/test/*.test.js
```

Tests use Node's built-in `test` module — no external framework. There is no linter configured.

## Architecture

`env-diff` is a CLI tool for detecting environment configuration drift and secret leaks. Entry point is `src/index.ts` (Commander-based CLI with three commands).

**Commands → files:**
- `compare` (`src/commands/compare.ts`) — diffs two env files for key/value drift; supports `--ignore-values` and `--fail-on-diff`
- `audit` (`src/commands/audit.ts`) — scans for secret leaks, gitignore safety, and README documentation drift
- `sync` (`src/commands/sync.ts`) — simulates push/pull with Vercel or AWS Secrets Manager

**Utilities:**
- `src/utils/parser.ts` — parses `.env`, JSON, YAML; flattens nested objects to `KEY_SUBKEY` form
- `src/utils/scanner.ts` — Shannon entropy calculation, regex patterns for known secret formats (Stripe/AWS/GitHub/Slack/Google), gitignore and README drift checks
- `src/utils/logger.ts` — terminal output via `picocolors`; specialized formatters for diff and audit results
- `src/types.ts` — `EnvMap`, `DiffResult`, `AuditIssue` interfaces

**Key behaviors:**
- Entropy threshold for secret detection: > 4.2, only when key name contains `SECRET`, `KEY`, `PASSWORD`, `TOKEN`, or `AUTH`
- Placeholder values (`localhost`, `example`, `my_secret`, etc.) are excluded from secret flagging
- CLI exits with code `1` on detected drift/issues when `--fail-on-diff` / `--fail-on-audit` flags are set
- Build output mirrors `src/` structure under `dist/`; module format is ESM (`"type": "module"` in package.json)
