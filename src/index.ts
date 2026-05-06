#!/usr/bin/env node

import { Command } from 'commander';
import { compareCommand } from './commands/compare.js';
import { auditCommand } from './commands/audit.js';
import { syncCommand } from './commands/sync.js';

const program = new Command();

program
  .name('env-drift')
  .description('Security & Drift Monitor for Secrets and Environment Files')
  .version('1.0.0');

// 1. Compare Command
program
  .command('compare')
  .description('Compare two or more environment files to detect drift')
  .argument('<files...>', 'Paths to environment files (2+ for matrix view)')
  .option('-f, --format <format>', 'Explicit format: env, json, yaml')
  .option('--ignore-values', 'Compare key existence only, ignoring actual values', false)
  .option('--fail-on-diff', 'Exit with code 1 if differences or drift is found', false)
  .option('-o, --output <format>', 'Output format: text, json, sarif', 'text')
  .option('--show-values', 'Print actual values for secret-like keys (default: redacted)', false)
  .action(async (files, options) => {
    await compareCommand(files, options);
  });

// 2. Audit Command
program
  .command('audit')
  .description('Perform security scan and documentation alignment check')
  .argument('[envFile]', 'Environment file to audit', '.env')
  .option('-r, --readme <path>', 'Path to README.md file', 'README.md')
  .option('--no-gitignore', 'Skip .gitignore presence check', false)
  .option('--fail-on-audit', 'Exit with code 1 if findings at/above --min-severity are present', false)
  .option('-o, --output <format>', 'Output format: text, json, sarif', 'text')
  .option('--min-severity <level>', 'Minimum severity to report/fail on: low, medium, high, critical', 'medium')
  .option('--baseline <path>', 'Baseline file of accepted findings to suppress')
  .option('--baseline-create <path>', 'Write current findings to a new baseline file and exit 0')
  .option('--ignore-file <path>', 'Path to .envdiffignore', '.envdiffignore')
  .option('--verify-secrets', 'Verify detected secrets against provider APIs (network calls)', false)
  .action(async (envFile, options) => {
    await auditCommand(envFile, options);
  });

// 3. Sync Command
program
  .command('sync')
  .description('Synchronize environment files with cloud providers')
  .argument('<provider>', 'Cloud provider (vercel | aws)')
  .argument('[envFile]', 'Local env file to sync', '.env')
  .option('--pull', 'Pull cloud variables to local file (defaults to pushing local to cloud)', false)
  .option('--project <name>', 'Project/secret name in cloud provider', 'my-node-app')
  .option('--dry-run', 'Show planned changes without writing', false)
  .option('--yes', 'Skip the interactive confirmation prompt before pushing', false)
  .action(async (provider, envFile, options) => {
    await syncCommand(envFile, provider as 'vercel' | 'aws', options);
  });

program.parse(process.argv);
