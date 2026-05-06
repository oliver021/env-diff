import readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import { logger } from '../utils/logger.js';
import { parseFile } from '../utils/parser.js';
import { listEnv, upsertEnv } from '../utils/vercel.js';
import pc from 'picocolors';

interface SyncOptions {
  pull?: boolean;
  push?: boolean;
  project?: string;
  dryRun?: boolean;
  yes?: boolean;
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(`${prompt} [y/N] `);
    return /^y(es)?$/i.test(ans.trim());
  } finally {
    rl.close();
  }
}

export async function syncCommand(envFile: string, provider: 'vercel' | 'aws', options: SyncOptions) {
  logger.header(`CLOUD ENV SYNC: ${provider.toUpperCase()}`);

  const isPull = !!options.pull;
  const isDryRun = !!options.dryRun;
  const project = options.project || 'my-node-app';

  if (provider === 'vercel') {
    const token = process.env.VERCEL_TOKEN;
    if (!token && !isDryRun) {
      logger.error('VERCEL_TOKEN environment variable is required for real sync. Use --dry-run to preview.');
      process.exit(2);
    }

    console.log(`  Target Project: ${pc.cyan(project)}`);
    console.log(`  Local File:     ${pc.cyan(envFile)}`);
    console.log(`  Direction:      ${isPull ? pc.yellow('PULL (Cloud → Local)') : pc.green('PUSH (Local → Cloud)')}`);
    console.log(`  Mode:           ${isDryRun ? pc.yellow('DRY-RUN') : pc.green('LIVE')}\n`);

    try {
      if (isPull) {
        if (isDryRun) {
          logger.info(`[dry-run] Would fetch env from Vercel project [${project}].`);
          return;
        }
        const remote = await listEnv(project, token!);
        const out = remote.map(v => `${v.key}=${v.value}`).join('\n') + '\n';
        const target = `${envFile}.new`;
        await fs.writeFile(target, out, 'utf-8');
        logger.success(`Pulled ${remote.length} variables to ${target}. Review before replacing ${envFile}.`);
      } else {
        const localEnv = await parseFile(envFile);
        const keys = Object.keys(localEnv);
        if (keys.length === 0) {
          logger.warn('No local environment variables to push.');
          return;
        }

        let remoteByKey: Record<string, string> = {};
        if (token) {
          const remote = await listEnv(project, token);
          remoteByKey = Object.fromEntries(remote.map(v => [v.key, v.value]));
        }

        const toAdd: string[] = [];
        const toUpdate: string[] = [];
        for (const k of keys) {
          if (!(k in remoteByKey)) toAdd.push(k);
          else if (remoteByKey[k] !== localEnv[k]) toUpdate.push(k);
        }

        console.log(pc.bold('Planned changes:'));
        console.log(`  ${pc.green('+')} add    : ${toAdd.length}`);
        console.log(`  ${pc.yellow('~')} update : ${toUpdate.length}`);
        console.log(`  ${pc.dim('=')} unchanged: ${keys.length - toAdd.length - toUpdate.length}\n`);
        for (const k of toAdd) console.log(`  ${pc.green('+')} ${k}`);
        for (const k of toUpdate) console.log(`  ${pc.yellow('~')} ${k}`);

        if (isDryRun) {
          logger.info('[dry-run] No changes pushed.');
          return;
        }

        if (toAdd.length === 0 && toUpdate.length === 0) {
          logger.success('Already in sync. Nothing to push.');
          return;
        }

        if (!options.yes) {
          const ok = await confirm(`Push ${toAdd.length + toUpdate.length} change(s) to Vercel project [${project}]?`);
          if (!ok) {
            logger.warn('Aborted.');
            process.exit(0);
          }
        }

        const payload = [...toAdd, ...toUpdate].map(k => ({ key: k, value: localEnv[k] }));
        await upsertEnv(project, token!, payload);
        logger.success(`Pushed ${payload.length} variable(s) to Vercel project [${project}].`);
      }
    } catch (error: any) {
      logger.error(`Vercel sync failed: ${error.message}`);
      process.exit(2);
    }
  } else if (provider === 'aws') {
    console.log(pc.bold('Simulating AWS Secrets Manager sync (real AWS sync not yet implemented)...'));
    console.log(`  Target Secret:  ${pc.cyan(project)}`);
    console.log(`  Local File:     ${pc.cyan(envFile)}`);
    console.log(`  Direction:      ${isPull ? pc.yellow('PULL') : pc.green('PUSH')}\n`);

    try {
      const localEnv = await parseFile(envFile).catch(() => ({}));
      const keys = Object.keys(localEnv);
      if (isPull) {
        logger.info(`Retrieving AWS Secret "${project}" value...`);
        logger.success(`[simulation] Local ${envFile} would be updated with AWS payload.`);
      } else {
        logger.info(`Updating AWS Secret "${project}"...`);
        logger.success(`[simulation] Would pack ${keys.length} variables into a JSON secret.`);
      }
    } catch (error: any) {
      logger.error(`AWS sync error: ${error.message}`);
    }
  } else {
    logger.error(`Unsupported provider "${provider}". Supported: vercel, aws`);
    process.exit(2);
  }
}
