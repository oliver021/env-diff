# env-drift

**Stop secrets from leaking. Stop environments from drifting.**

`env-drift` is a zero-dependency CLI that keeps your `.env` files honest — it diffs any number of environment files at once, audits for leaked secrets, and integrates with GitHub Actions in a single `npx` command.

---

## Quick start

```bash
# Compare two files
npx env-drift compare .env .env.production

# Compare three files side by side (matrix view)
npx env-drift compare .env .env.staging .env.production

# Audit a file for leaked secrets and doc drift
npx env-drift audit .env

# Push local vars to Vercel (dry-run first)
VERCEL_TOKEN=xxx npx env-drift sync vercel .env --dry-run
```

---

## Installation

```bash
# Project-local (recommended for CI)
npm install -D env-drift

# Or run on-demand with npx — no install needed
npx env-drift <command>
```

**Requires Node.js 20+.**

---

## Commands

### `compare` — spot environment drift

Diff two or more environment files. When you pass three or more files, you get a matrix view with every key as a row and every file as a column.

```bash
env-drift compare <file1> <file2> [file3 ...] [options]
```

| Option | Description |
|---|---|
| `--ignore-values` | Check key presence only, skip value comparison |
| `--fail-on-diff` | Exit `1` if drift is found (great for CI) |
| `--show-values` | Print actual values (secret-like keys are redacted by default) |
| `-o, --output <format>` | `text` (default) · `json` |
| `-f, --format <format>` | Force file format: `env` · `json` · `yaml` |

**Two-file diff:**

```
═══ ENV COMPARISON: .env ↔ .env.production ═══

▼ MISSING IN .ENV.PRODUCTION:
  - STRIPE_SECRET

◆ DIFFERENT VALUES:
  ● API_URL
    .env:            http://localhost:3000
    .env.production: https://api.app.com
```

**Three-file matrix:**

```
═══ ENV COMPARISON: .env ↔ .env.staging ↔ .env.production ═══

Reference (column 1): .env

▼ DRIFT (3)
KEY          .env              .env.staging       .env.production
──────────────────────────────────────────────────────────────────
API_URL      ✓ localhost:3000  ≠ staging.app.com  ≠ api.app.com
DEBUG        ✓ true            ✓ true             ✗ missing
SENTRY_DSN   ✗ missing         ✗ missing          ≠ https://...

✓ 1 key(s) consistent across all files
```

> Secret-like keys (`SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `AUTH`, `JWT`, `CREDENTIAL`) are shown as `****` unless you pass `--show-values`.

---

### `audit` — catch leaks before they reach Git

Scans your env file for three categories of problems:

1. **Secret leaks** — pattern matching for Stripe, AWS, GitHub, Slack, Google keys + Shannon entropy analysis for generic high-entropy secrets
2. **Gitignore safety** — confirms your env file is covered by `.gitignore`
3. **Documentation drift** — checks that every key in your `README.md` exists locally, and every local key is documented

```bash
env-drift audit [envFile] [options]
```

| Option | Description |
|---|---|
| `-r, --readme <path>` | Path to README for doc-drift check (default: `README.md`) |
| `--no-gitignore` | Skip the `.gitignore` check |
| `--fail-on-audit` | Exit `1` when findings at/above `--min-severity` exist |
| `--min-severity <level>` | Threshold: `low` · `medium` (default) · `high` · `critical` |
| `-o, --output <format>` | `text` (default) · `json` · `sarif` |
| `--baseline <path>` | Suppress previously-accepted findings |
| `--baseline-create <path>` | Snapshot current findings as the new baseline |
| `--ignore-file <path>` | Path to ignore rules file (default: `.envdiffignore`) |
| `--verify-secrets` | Call provider APIs to confirm if detected keys are live |

**Sample output:**

```
═══ ENV SECURITY & DRIFT AUDIT: .env ═══

Found 2 audit issue(s):

=== HIGH SEVERITY (Action Required) ===
  ❌ Leaked Stripe Secret Key detected in variable "STRIPE_SECRET"! [leak.stripe]
     Value matches typical signature of a production secret. Do not commit this file.
     Location: .env

=== MEDIUM SEVERITY ===
  ⚠️  Suspected high-entropy secret in "JWT_SECRET" [leak.entropy]
     Shannon entropy: 4.61. Ensure this file is never checked into Git.
     Location: .env
```

---

### `sync` — keep local and cloud in sync

Push or pull environment variables between your local file and a cloud provider.

```bash
env-drift sync <provider> [envFile] [options]
```

| Option | Description |
|---|---|
| `--pull` | Pull cloud vars to `<envFile>.new` (local is never overwritten directly) |
| `--dry-run` | Preview planned changes without touching anything |
| `--yes` | Skip the confirmation prompt before pushing |
| `--project <name>` | Project identifier in the cloud provider |

**Supported providers:**

| Provider | Status | Auth |
|---|---|---|
| `vercel` | ✅ Real API | `VERCEL_TOKEN` env var |
| `aws` | Simulated | — |

```bash
# See what would change
VERCEL_TOKEN=xxx env-drift sync vercel .env --project my-app --dry-run

# Push for real (prompts for confirmation)
VERCEL_TOKEN=xxx env-drift sync vercel .env --project my-app

# Pull production vars for review
VERCEL_TOKEN=xxx env-drift sync vercel .env.production --pull
```

> Pull mode writes to `.env.production.new` — review and rename it yourself. This prevents accidental overwrites.

---

## Suppressing findings

### Ignore file (`.envdiffignore`)

Create a `.envdiffignore` to permanently suppress known-safe findings. Each line uses the format `ruleId[:key[@file]]`:

```
# Suppress all entropy findings globally
leak.entropy

# Suppress Stripe finding only for this key
leak.stripe:STRIPE_TEST_KEY

# Suppress a doc-drift warning for one key in one file
doc-drift.undocumented:DEBUG@.env.local
```

Run with `--ignore-file <path>` to point at a custom location.

### Baseline file

Snapshot the current state of findings so existing issues are accepted but new ones still fail:

```bash
# Create baseline from current findings
env-drift audit .env --baseline-create .envdiff-baseline.json

# Re-audit — existing findings suppressed, new ones surface
env-drift audit .env --baseline .envdiff-baseline.json --fail-on-audit
```

Commit `.envdiff-baseline.json` to track accepted findings over time.

### Rule IDs

Every finding carries a `ruleId` you can reference in your ignore file or baseline:

| Rule ID | Description |
|---|---|
| `leak.stripe` | Stripe secret key pattern |
| `leak.aws` | AWS Access Key ID pattern |
| `leak.github` | GitHub personal access token |
| `leak.slack` | Slack bot token |
| `leak.google` | Google API key |
| `leak.entropy` | High Shannon entropy + secret-like key name |
| `gitignore.missing-entry` | Env file not covered by `.gitignore` |
| `gitignore.unreadable` | `.gitignore` file missing or unreadable |
| `doc-drift.missing-in-env` | Key documented in README but absent locally |
| `doc-drift.undocumented` | Key active locally but not in README |

---

## CI / CD integration

### GitHub Actions

Add audit findings to GitHub's **Security → Code scanning** tab:

```yaml
- name: Run env-drift audit
  run: |
    npx -y env-drift audit .env.example \
      --output sarif > env-drift.sarif
  continue-on-error: true

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: env-drift.sarif
```

A ready-to-use composite action is included in this repo (`action.yml`). See [`examples/github-workflow.yml`](examples/github-workflow.yml) for a full workflow.

### Pre-commit hook

If you use [pre-commit](https://pre-commit.com), add this to your `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/node-utils/env-drift
    rev: v1.0.0
    hooks:
      - id: env-drift-audit
```

The hook runs `audit --fail-on-audit` on every staged `.env*` file before a commit lands.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — no findings at/above threshold |
| `1` | Findings found + `--fail-on-diff` / `--fail-on-audit` was set |
| `2` | Tool error (missing file, parse failure, missing token) |

Separating `1` (policy failure) from `2` (tool failure) makes CI failure modes easy to diagnose.

---

## Machine-readable output

Both `compare` and `audit` support `--output json` for scripting. `audit` also supports `--output sarif` for GitHub code-scanning.

```bash
# Pipe audit results into jq
env-drift audit .env --output json --no-gitignore | jq '.issues[] | select(.severity == "high")'

# Count SARIF results
env-drift audit .env --output sarif | jq '.runs[0].results | length'
```

---

## Verified secret detection

Add `--verify-secrets` to have `env-drift` call each provider's API and confirm whether a detected key is **actually live**. A live key is upgraded to `critical` severity.

```bash
env-drift audit .env --verify-secrets --fail-on-audit --min-severity critical
```

Supported providers for live verification: **Stripe**, **GitHub**. AWS support coming soon.

> Verification makes outbound network requests and may trigger rate-limits. Use it in CI jobs that already have network access, not in tight loops.

---

## Supported file formats

`env-drift` auto-detects the format from the file extension. You can override it with `-f, --format`.

| Extension | Format |
|---|---|
| `.env`, `.env.*` | dotenv |
| `.json` | JSON (nested objects are flattened to `KEY_SUBKEY`) |
| `.yaml`, `.yml` | YAML (same flattening) |

---

## License

MIT
