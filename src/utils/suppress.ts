import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { AuditIssue, IssueSeverity } from '../types.js';

export const SEVERITY_RANK: Record<IssueSeverity, number> = {
  low: 0, medium: 1, high: 2, critical: 3
};

export function meetsThreshold(severity: IssueSeverity, min: IssueSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

export function fingerprint(issue: AuditIssue): string {
  const parts = [issue.ruleId, issue.key || '', issue.file || ''];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

export interface IgnoreRule {
  ruleId: string;
  key?: string;
  file?: string;
}

export async function loadIgnore(path: string): Promise<IgnoreRule[]> {
  let content: string;
  try {
    content = await fs.readFile(path, 'utf-8');
  } catch {
    return [];
  }
  const rules: IgnoreRule[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    // Format: ruleId | ruleId:key | ruleId:key@file
    const atSplit = line.split('@');
    const head = atSplit[0];
    const file = atSplit[1]?.trim();
    const colonSplit = head.split(':');
    const ruleId = colonSplit[0].trim();
    const key = colonSplit[1]?.trim();
    rules.push({ ruleId, key, file });
  }
  return rules;
}

export async function loadBaseline(path: string): Promise<Set<string>> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content);
    return new Set<string>(Array.isArray(data.fingerprints) ? data.fingerprints : []);
  } catch {
    return new Set();
  }
}

export async function writeBaseline(path: string, issues: AuditIssue[]): Promise<void> {
  const data = {
    version: 1,
    createdAt: new Date().toISOString(),
    fingerprints: issues.map(fingerprint)
  };
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

export function applySuppressions(
  issues: AuditIssue[],
  ignore: IgnoreRule[],
  baseline: Set<string>
): AuditIssue[] {
  return issues.filter(issue => {
    if (baseline.has(fingerprint(issue))) return false;
    for (const rule of ignore) {
      if (rule.ruleId !== issue.ruleId) continue;
      if (rule.key && rule.key !== issue.key) continue;
      if (rule.file && rule.file !== issue.file) continue;
      return false;
    }
    return true;
  });
}
