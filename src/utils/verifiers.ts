import { AuditIssue, EnvMap } from '../types.js';

interface VerifyResult {
  live: boolean;
  detail?: string;
}

async function verifyStripe(value: string): Promise<VerifyResult> {
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${value}` }
    });
    if (res.status === 200) return { live: true, detail: 'Stripe API accepted the key.' };
    return { live: false };
  } catch (e: any) {
    return { live: false, detail: `Verification error: ${e.message}` };
  }
}

async function verifyGithub(value: string): Promise<VerifyResult> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${value}`, 'User-Agent': 'env-drift' }
    });
    if (res.status === 200) return { live: true, detail: 'GitHub API accepted the token.' };
    return { live: false };
  } catch (e: any) {
    return { live: false, detail: `Verification error: ${e.message}` };
  }
}

const VERIFIERS: Record<string, (value: string) => Promise<VerifyResult>> = {
  'leak.stripe': verifyStripe,
  'leak.github': verifyGithub
};

export async function verifyIssues(issues: AuditIssue[], envMap: EnvMap): Promise<AuditIssue[]> {
  const out: AuditIssue[] = [];
  for (const issue of issues) {
    const verifier = VERIFIERS[issue.ruleId];
    if (!verifier || !issue.key) {
      out.push(issue);
      continue;
    }
    const value = envMap[issue.key];
    if (!value) { out.push(issue); continue; }
    const result = await verifier(value);
    if (result.live) {
      out.push({
        ...issue,
        severity: 'critical',
        message: issue.message + ' [VERIFIED LIVE]',
        details: (issue.details || '') + ' ' + (result.detail || '')
      });
    } else {
      out.push(issue);
    }
  }
  return out;
}
