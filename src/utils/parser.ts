import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import yaml from 'js-yaml';
import { EnvMap } from '../types.js';

/**
 * Recursively flattens a nested object into a single-level Record<string, string>
 */
function flattenObject(obj: any, prefix = ''): EnvMap {
  const result: EnvMap = {};
  if (!obj || typeof obj !== 'object') return result;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}_${key}`.toUpperCase() : key.toUpperCase();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value !== null && value !== undefined ? String(value) : '';
    }
  }
  return result;
}

/**
 * Parses an environment file based on extension or explicit format.
 */
export async function parseFile(filePath: string, format?: 'env' | 'json' | 'yaml'): Promise<EnvMap> {
  const resolvedPath = path.resolve(filePath);
  let content: string;
  try {
    content = await fs.readFile(resolvedPath, 'utf-8');
  } catch (error: any) {
    throw new Error(`Failed to read file at ${filePath}: ${error.message}`);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const fileFormat = format || (ext === '.json' ? 'json' : (ext === '.yaml' || ext === '.yml' ? 'yaml' : 'env'));

  if (fileFormat === 'json') {
    try {
      const parsed = JSON.parse(content);
      return flattenObject(parsed);
    } catch (error: any) {
      throw new Error(`Failed to parse JSON file ${filePath}: ${error.message}`);
    }
  }

  if (fileFormat === 'yaml') {
    try {
      const parsed = yaml.load(content);
      return flattenObject(parsed);
    } catch (error: any) {
      throw new Error(`Failed to parse YAML file ${filePath}: ${error.message}`);
    }
  }

  // Default to env format
  try {
    const parsed = dotenv.parse(content);
    return parsed;
  } catch (error: any) {
    throw new Error(`Failed to parse .env file ${filePath}: ${error.message}`);
  }
}
