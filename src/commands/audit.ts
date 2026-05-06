import fs from 'node:fs/promises';
import { parseFile } from '../utils/parser.js';
import { logger } from '../utils/logger.js';
import { scanSecrets, checkGitignore, checkReadmeDrift } from '../utils/scanner.js';
import { verifyIssues } from '../utils/verifiers.js';
import { toJson, toSarif } from '../utils/reporters.js';
import {
  loadIgnore, loadBaseline, writeBaseline, applySuppressions, meetsThreshold
} from '../utils/suppress.js';
import { AuditIssue, IssueSeverity } from '../types.js';

interface AuditOptions {
  readme?: string;
  gitignore?: boolean;
  failOnAudit?: boolean;
  output?: 'text' | 'json' | 'sarif';
  minSeverity?: IssueSeverity;
  baseline?: string;
  baselineCreate?: string;
  ignoreFile?: string;
  verifySecrets?: boolean;
}

export async function auditCommand(envFile: string, options: AuditOptions) {
  const readmePath = options.readme || 'README.md';
  const checkGit = options.gitignore !== false;
  const failOnAudit = !!options.failOnAudit;
  const output = options.output || 'text';
  const minSeverity: IssueSeverity = options.minSeverity || 'medium';
  const isText = output === 'text';

  if (isText) logger.header(`ENV SECURITY & DRIFT AUDIT: ${envFile}`);

  try {
    const envMap = await parseFile(envFile);
    let allIssues: AuditIssue[] = [];

    allIssues.push(...scanSecrets(envMap, envFile));

    if (checkGit) {
      allIssues.push(...await checkGitignore([envFile]));
    }

    try {
      const hasReadme = await fs.stat(readmePath).then(() => true).catch(() => false);
      if (hasReadme) {
        allIssues.push(...await checkReadmeDrift(envMap, readmePath));
      } else if (options.readme) {
        if (isText) logger.warn(`Specified README file "${readmePath}" was not found.`);
      }
    } catch {
      // ignored
    }

    if (options.verifySecrets) {
      allIssues = await verifyIssues(allIssues, envMap);
    }

    if (options.baselineCreate) {
      await writeBaseline(options.baselineCreate, allIssues);
      if (isText) logger.success(`Baseline written to ${options.baselineCreate} with ${allIssues.length} accepted findings.`);
      process.exit(0);
    }

    const ignore = await loadIgnore(options.ignoreFile || '.envdiffignore');
    const baseline = options.baseline ? await loadBaseline(options.baseline) : new Set<string>();
    const filtered = applySuppressions(allIssues, ignore, baseline);
    const reportable = filtered.filter(i => meetsThreshold(i.severity, minSeverity));

    if (output === 'json') {
      process.stdout.write(toJson(reportable) + '\n');
    } else if (output === 'sarif') {
      process.stdout.write(toSarif(reportable) + '\n');
    } else {
      logger.printAudit(reportable);
      const suppressed = allIssues.length - filtered.length;
      const belowThreshold = filtered.length - reportable.length;
      if (suppressed > 0) logger.info(`${suppressed} finding(s) suppressed by baseline/ignore file.`);
      if (belowThreshold > 0) logger.info(`${belowThreshold} finding(s) below --min-severity=${minSeverity}.`);
    }

    const hasFailures = reportable.length > 0;
    if (hasFailures && failOnAudit) {
      if (isText) logger.error(`Audit failed: ${reportable.length} finding(s) at/above ${minSeverity}.`);
      process.exit(1);
    }
  } catch (error: any) {
    if (isText) logger.error(`Error during audit: ${error.message}`);
    else process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
    process.exit(2);
  }
}
