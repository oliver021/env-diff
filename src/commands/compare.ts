import { parseFile } from '../utils/parser.js';
import { logger } from '../utils/logger.js';
import { toJson } from '../utils/reporters.js';
import { DiffResult, DiffItem, MatrixDiffResult, MatrixCell } from '../types.js';

interface CompareOptions {
  format?: 'env' | 'json' | 'yaml';
  ignoreValues?: boolean;
  failOnDiff?: boolean;
  output?: 'text' | 'json' | 'sarif';
  showValues?: boolean;
}

const SECRET_KEY_PATTERN = /SECRET|KEY|PASSWORD|TOKEN|AUTH|CREDENTIAL|PASS|JWT/i;

function redact(key: string, value: string, showValues: boolean): string {
  if (showValues) return value;
  if (!value) return value;
  if (SECRET_KEY_PATTERN.test(key)) return '****';
  return value;
}

export async function compareCommand(files: string[], options: CompareOptions) {
  const ignoreValues = !!options.ignoreValues;
  const failOnDiff = !!options.failOnDiff;
  const output = options.output || 'text';
  const showValues = !!options.showValues;
  const isText = output === 'text';

  if (files.length < 2) {
    logger.error('compare requires at least two files');
    process.exit(2);
  }

  if (isText) {
    logger.header(`ENV COMPARISON: ${files.join(' ↔ ')}`);
  }

  try {
    const envs = await Promise.all(files.map(f => parseFile(f, options.format)));

    if (files.length === 2) {
      const [env1, env2] = envs;
      const [file1, file2] = files;
      const keys1 = Object.keys(env1);
      const keys2 = Object.keys(env2);

      const missingInFile2 = keys1.filter(k => !(k in env2));
      const missingInFile1 = keys2.filter(k => !(k in env1));

      const differentValues: DiffItem[] = [];
      if (!ignoreValues) {
        const commonKeys = keys1.filter(k => k in env2);
        for (const key of commonKeys) {
          if (env1[key] !== env2[key]) {
            differentValues.push({
              key,
              val1: redact(key, env1[key], showValues),
              val2: redact(key, env2[key], showValues)
            });
          }
        }
      }

      const result: DiffResult = { missingInFile2, missingInFile1, differentValues };

      if (output === 'json') {
        process.stdout.write(JSON.stringify({ kind: 'diff', file1, file2, result }, null, 2) + '\n');
      } else {
        logger.printDiff(result, file1, file2, ignoreValues);
      }

      const hasDrift = missingInFile1.length > 0 || missingInFile2.length > 0 || differentValues.length > 0;
      if (hasDrift && failOnDiff) {
        if (isText) logger.error('CI check failed: Environment drift detected!');
        process.exit(1);
      }
      return;
    }

    const allKeys = new Set<string>();
    for (const env of envs) for (const k of Object.keys(env)) allKeys.add(k);
    const keys = [...allKeys].sort();

    const cells: Record<string, Record<string, MatrixCell>> = {};
    for (const key of keys) {
      cells[key] = {};
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const env = envs[i];
        const present = key in env;
        cells[key][file] = {
          present,
          value: present ? redact(key, env[key], showValues) : ''
        };
      }
    }

    const matrix: MatrixDiffResult = {
      files,
      keys,
      cells,
      reference: files[0]
    };

    if (output === 'json') {
      process.stdout.write(JSON.stringify({ kind: 'matrix', result: matrix }, null, 2) + '\n');
    } else {
      logger.printMatrix(matrix, ignoreValues);
    }

    let hasDrift = false;
    for (const key of keys) {
      const refCell = cells[key][files[0]];
      for (let i = 1; i < files.length; i++) {
        const cell = cells[key][files[i]];
        if (cell.present !== refCell.present) { hasDrift = true; break; }
        if (!ignoreValues && cell.present && refCell.present && cell.value !== refCell.value) {
          hasDrift = true; break;
        }
      }
      if (hasDrift) break;
    }

    if (hasDrift && failOnDiff) {
      if (isText) logger.error('CI check failed: Environment drift detected!');
      process.exit(1);
    }
  } catch (error: any) {
    if (isText) logger.error(`Error during comparison: ${error.message}`);
    else process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
    process.exit(2);
  }
}
