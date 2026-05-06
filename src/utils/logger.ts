import pc from 'picocolors';
import { DiffResult, AuditIssue, MatrixDiffResult } from '../types.js';

export const logger = {
  info(msg: string) {
    console.log(`${pc.blue('ℹ')} ${msg}`);
  },

  success(msg: string) {
    console.log(`${pc.green('✔')} ${pc.bold(msg)}`);
  },

  warn(msg: string) {
    console.warn(`${pc.yellow('⚠')} ${pc.yellow(msg)}`);
  },

  error(msg: string) {
    console.error(`${pc.red('✖')} ${pc.bold(pc.red(msg))}`);
  },

  header(title: string) {
    console.log(`\n${pc.cyan(pc.bold(`═══ ${title} ═══`))}\n`);
  },

  printDiff(result: DiffResult, file1: string, file2: string, ignoreValues: boolean) {
    const hasDrift =
      result.missingInFile1.length > 0 ||
      result.missingInFile2.length > 0 ||
      (!ignoreValues && result.differentValues.length > 0);

    if (!hasDrift) {
      this.success(`No environment drift detected between [${file1}] and [${file2}]!`);
      return;
    }

    if (result.missingInFile2.length > 0) {
      console.log(pc.red(pc.bold(`\n▼ MISSING IN ${file2.toUpperCase()}:`)));
      for (const key of result.missingInFile2) {
        console.log(`  ${pc.red('-')} ${pc.bold(key)}`);
      }
    }

    if (result.missingInFile1.length > 0) {
      console.log(pc.yellow(pc.bold(`\n▲ MISSING IN ${file1.toUpperCase()}:`)));
      for (const key of result.missingInFile1) {
        console.log(`  ${pc.yellow('+')} ${pc.bold(key)}`);
      }
    }

    if (!ignoreValues && result.differentValues.length > 0) {
      console.log(pc.cyan(pc.bold(`\n◆ DIFFERENT VALUES:`)));
      for (const item of result.differentValues) {
        console.log(`  ${pc.cyan('●')} ${pc.bold(item.key)}`);
        console.log(`    ${pc.dim(file1)}: ${pc.yellow(item.val1 || '(empty)')}`);
        console.log(`    ${pc.dim(file2)}: ${pc.green(item.val2 || '(empty)')}`);
      }
    }
    console.log();
  },

  printMatrix(result: MatrixDiffResult, ignoreValues: boolean) {
    const { files, keys, cells, reference } = result;
    console.log(pc.dim(`Reference (column 1): ${reference}`));
    console.log(pc.dim(`Comparing ${keys.length} keys across ${files.length} files`));
    console.log();

    const okKeys: string[] = [];
    const driftKeys: string[] = [];
    for (const key of keys) {
      const ref = cells[key][reference];
      let drift = false;
      for (let i = 1; i < files.length; i++) {
        const cell = cells[key][files[i]];
        if (cell.present !== ref.present) { drift = true; break; }
        if (!ignoreValues && cell.present && ref.present && cell.value !== ref.value) {
          drift = true; break;
        }
      }
      (drift ? driftKeys : okKeys).push(key);
    }

    const keyColWidth = Math.max(3, ...keys.map(k => k.length));
    const fileLabels = files.map(f => f.length > 18 ? '…' + f.slice(-17) : f);
    const colWidth = Math.max(8, ...fileLabels.map(l => l.length + 2));

    const renderHeader = () => {
      const head = 'KEY'.padEnd(keyColWidth) + '  ' + fileLabels.map(l => l.padEnd(colWidth)).join('');
      console.log(pc.bold(head));
      console.log(pc.dim('─'.repeat(head.length)));
    };

    const renderRow = (key: string) => {
      const ref = cells[key][reference];
      const parts = files.map((file) => {
        const cell = cells[key][file];
        if (!cell.present) return pc.red('✗ missing');
        if (!ignoreValues && cell.value !== ref.value && file !== reference) {
          return pc.yellow(`≠ ${cell.value || '(empty)'}`);
        }
        if (ignoreValues) return pc.green('✓');
        return pc.green(`✓ ${cell.value || '(empty)'}`);
      });
      const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
      const padded = parts.map(p => p + ' '.repeat(Math.max(0, colWidth - visible(p).length)));
      console.log(pc.bold(key.padEnd(keyColWidth)) + '  ' + padded.join(''));
    };

    if (driftKeys.length > 0) {
      console.log(pc.red(pc.bold(`▼ DRIFT (${driftKeys.length})`)));
      renderHeader();
      for (const key of driftKeys) renderRow(key);
      console.log();
    }

    if (okKeys.length > 0) {
      console.log(pc.green(`✓ ${okKeys.length} key(s) consistent across all files`));
    }

    if (driftKeys.length === 0) {
      this.success(`No environment drift detected across ${files.length} files!`);
    }
    console.log();
  },

  printAudit(issues: AuditIssue[]) {
    if (issues.length === 0) {
      this.success('Audit completed successfully. No security or drift issues found!');
      return;
    }

    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');
    const medium = issues.filter(i => i.severity === 'medium');
    const low = issues.filter(i => i.severity === 'low');

    console.log(pc.bold(`Found ${issues.length} audit issue(s):\n`));

    const printGroup = (title: string, list: AuditIssue[], colorFn: (s: string) => string) => {
      if (list.length === 0) return;
      console.log(colorFn(pc.bold(`=== ${title} ===`)));
      for (const issue of list) {
        let prefix = '●';
        if (issue.severity === 'critical') prefix = '🔥';
        if (issue.severity === 'high') prefix = '❌';
        if (issue.severity === 'medium') prefix = '⚠️';
        if (issue.severity === 'low') prefix = 'ℹ️';

        console.log(`  ${prefix} ${pc.bold(issue.message)} ${pc.dim(`[${issue.ruleId}]`)}`);
        if (issue.details) {
          console.log(`     ${pc.dim(issue.details)}`);
        }
        if (issue.file) {
          const lineStr = issue.line ? `:${issue.line}` : '';
          console.log(`     ${pc.dim('Location:')} ${pc.underline(issue.file + lineStr)}`);
        }
        console.log();
      }
    };

    printGroup('CRITICAL (Verified Live Secret!)', critical, pc.magenta);
    printGroup('HIGH SEVERITY (Action Required)', high, pc.red);
    printGroup('MEDIUM SEVERITY', medium, pc.yellow);
    printGroup('LOW SEVERITY', low, pc.blue);
  }
};
