import fs from 'node:fs/promises';
import path from 'node:path';
import { AuditIssue, EnvMap } from '../types.js';

/**
 * Calculates Shannon Entropy of a string to detect randomized keys/secrets.
 */
export function calculateEntropy(str: string): number {
  if (!str) return 0;
  const len = str.length;
  const frequencies: { [char: string]: number } = {};

  for (let i = 0; i < len; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  for (const count of Object.values(frequencies)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Scans a set of environment variables for known secret patterns and high entropy.
 */
export function scanSecrets(envMap: EnvMap, filePath: string): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Patterns for known secret formats
  const patterns = [
    { name: 'Stripe Secret Key', ruleId: 'leak.stripe', regex: /sk_(test|live)_[0-9a-zA-Z]{24,}/, severity: 'high' as const },
    { name: 'AWS Access Key ID', ruleId: 'leak.aws', regex: /AKIA[0-9A-Z]{16}/, severity: 'high' as const },
    { name: 'GitHub Personal Access Token', ruleId: 'leak.github', regex: /gh[p|o|u|s]_[0-9a-zA-Z]{36,}/, severity: 'high' as const },
    { name: 'Slack Bot Token', ruleId: 'leak.slack', regex: /xoxb-[0-9]{10,}-[0-9a-zA-Z]{24,}/, severity: 'high' as const },
    { name: 'Google API Key', ruleId: 'leak.google', regex: /AIzaSy[0-9a-zA-Z-_]{33}/, severity: 'high' as const }
  ];

  for (const [key, val] of Object.entries(envMap)) {
    if (!val) continue;

    // 1. Run pattern matched scanners
    for (const pattern of patterns) {
      if (pattern.regex.test(val)) {
        issues.push({
          type: 'leak',
          ruleId: pattern.ruleId,
          severity: pattern.severity,
          message: `Leaked ${pattern.name} detected in variable "${key}"!`,
          details: `Value matches typical signature of a production secret. Do not commit this file.`,
          file: filePath,
          key
        });
      }
    }

    // 2. High entropy scanner (only flag values that look like long random hashes)
    const isGenericSecretKey = /SECRET|KEY|PASSWORD|TOKEN|AUTH|CREDENTIAL|PASS|JWT/i.test(key);
    if (isGenericSecretKey && val.length > 20) {
      const isPlaceholder = /placeholder|your_|insert_|my_secret|localhost|example|127\.0\.0\.1/i.test(val);
      if (!isPlaceholder) {
        const entropy = calculateEntropy(val);
        if (entropy > 4.2) {
          issues.push({
            type: 'leak',
            ruleId: 'leak.entropy',
            severity: 'medium',
            message: `Suspected high-entropy secret detected in variable "${key}"`,
            details: `Value is long, random, and has high Shannon entropy (${entropy.toFixed(2)}). Ensure this file is never checked into Git.`,
            file: filePath,
            key
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validates that local environment files are safely declared in .gitignore
 */
export async function checkGitignore(filesToCheck: string[], projectRoot = '.'): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  const gitignorePath = path.resolve(projectRoot, '.gitignore');

  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

    for (const file of filesToCheck) {
      const baseName = path.basename(file);
      // Basic match logic: checks if file name is explicitly listed, or matched by wildcards like *.env or .env*
      const isIgnored = lines.some(line => {
        if (line === baseName || line === file) return true;
        if (line.includes('*')) {
          const regexStr = '^' + line.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
          const regex = new RegExp(regexStr);
          return regex.test(baseName);
        }
        return false;
      });

      if (!isIgnored) {
        issues.push({
          type: 'gitignore',
          ruleId: 'gitignore.missing-entry',
          severity: 'high',
          message: `File "${baseName}" is NOT ignored by your .gitignore!`,
          details: `Failing to ignore environment configuration files poses a major security leak risk. Add "${baseName}" or "*.env" to your .gitignore immediately.`,
          file: gitignorePath
        });
      }
    }
  } catch (error: any) {
    issues.push({
      type: 'gitignore',
      ruleId: 'gitignore.unreadable',
      severity: 'medium',
      message: `Could not read .gitignore file: ${error.message}`,
      details: `Ensure you have a .gitignore file at the root of your project to prevent secret leaks.`,
      file: gitignorePath
    });
  }

  return issues;
}

/**
 * Scans README.md for expected environment variables and compares them with actual keys
 */
export async function checkReadmeDrift(envMap: EnvMap, readmePath: string): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  const resolvedReadme = path.resolve(readmePath);

  try {
    const content = await fs.readFile(resolvedReadme, 'utf-8');
    
    // Find uppercase letters of length 3+ that look like ENV variables (e.g., PORT, STRIPE_SECRET, DB_URL)
    const envRegex = /\b[A-Z][A-Z0-9_]{2,}\b/g;
    const matches = content.match(envRegex) || [];
    
    // Exclude common markdown or generic words that are capitalized
    const commonExclusions = new Set([
      'API', 'CLI', 'NPM', 'GIT', 'URL', 'JSON', 'YAML', 'HTML', 'CSS', 'AWS', 
      'ESM', 'CWD', 'TS', 'JS', 'MD', 'MIT', 'HTTP', 'HTTPS', 'SSL', 'CI', 'CD'
    ]);
    
    const documentedKeys = new Set(
      matches
        .filter(key => !commonExclusions.has(key))
    );

    for (const key of documentedKeys) {
      if (!(key in envMap)) {
        issues.push({
          type: 'doc-drift',
          ruleId: 'doc-drift.missing-in-env',
          severity: 'low',
          message: `Variable "${key}" is documented in README.md but missing in your environment file.`,
          details: `Ensure this variable is set or specify if it is optional.`,
          file: readmePath,
          key
        });
      }
    }

    for (const key of Object.keys(envMap)) {
      if (!documentedKeys.has(key) && !key.startsWith('_')) {
        issues.push({
          type: 'doc-drift',
          ruleId: 'doc-drift.undocumented',
          severity: 'low',
          message: `Variable "${key}" is active in your environment file but undocumented in README.md.`,
          details: `Document this variable in README.md to help other developers set up their workspace.`,
          file: readmePath,
          key
        });
      }
    }

  } catch (error: any) {
    issues.push({
      type: 'doc-drift',
      ruleId: 'doc-drift.unreadable',
      severity: 'medium',
      message: `Could not read README.md file: ${error.message}`,
      details: `Create a README.md file to document setup instructions and required environment variables.`,
      file: readmePath
    });
  }

  return issues;
}
