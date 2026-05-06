import { AuditIssue, IssueSeverity } from '../types.js';

export function toJson(issues: AuditIssue[]): string {
  return JSON.stringify({ kind: 'audit', issues }, null, 2);
}

const SEVERITY_TO_SARIF: Record<IssueSeverity, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note'
};

export function toSarif(issues: AuditIssue[], toolVersion = '1.0.0'): string {
  const ruleIds = [...new Set(issues.map(i => i.ruleId))];
  const rules = ruleIds.map(id => ({
    id,
    name: id,
    shortDescription: { text: id },
    defaultConfiguration: { level: 'warning' }
  }));

  const results = issues.map(issue => ({
    ruleId: issue.ruleId,
    level: SEVERITY_TO_SARIF[issue.severity],
    message: { text: issue.details ? `${issue.message} ${issue.details}` : issue.message },
    locations: issue.file
      ? [{
          physicalLocation: {
            artifactLocation: { uri: issue.file },
            ...(issue.line ? { region: { startLine: issue.line } } : {})
          }
        }]
      : [],
    properties: {
      severity: issue.severity,
      ...(issue.key ? { key: issue.key } : {})
    }
  }));

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'env-diff',
          version: toolVersion,
          informationUri: 'https://github.com/node-utils/env-diff',
          rules
        }
      },
      results
    }]
  };

  return JSON.stringify(sarif, null, 2);
}
