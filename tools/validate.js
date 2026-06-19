#!/usr/bin/env node

/**
 * SHIFT Card JSON Standard — Schema Validator
 *
 * Validates SHIFT card and collection JSON files against the official schema.
 *
 * Usage:
 *   node tools/validate.js path/to/card.json
 *   node tools/validate.js path/to/directory/
 *
 * @version 1.0.0
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// ─── Constants ───────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const CARD_SCHEMA_PATH = resolve(PROJECT_ROOT, 'schema/v1/shift-card.schema.json');
const COLLECTION_SCHEMA_PATH = resolve(PROJECT_ROOT, 'schema/v1/shift-collection.schema.json');

// ANSI color codes
const COLOR = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const PASS = `${COLOR.green}✓${COLOR.reset}`;
const FAIL = `${COLOR.red}✗${COLOR.reset}`;
const WARN = `${COLOR.yellow}⚠${COLOR.reset}`;

// ─── Schema Loading ──────────────────────────────────────

/**
 * Load and compile JSON schemas with AJV.
 * @returns {{ validateCard: Function, validateCollection: Function }}
 */
function loadSchemas() {
  const ajv = new Ajv2020({
    allErrors: true,
    verbose: true,
    strict: false,
  });
  addFormats(ajv);

  // Load both schemas
  const cardSchema = JSON.parse(readFileSync(CARD_SCHEMA_PATH, 'utf-8'));
  const collectionSchema = JSON.parse(readFileSync(COLLECTION_SCHEMA_PATH, 'utf-8'));

  // Add card schema first so collection can reference it
  ajv.addSchema(cardSchema, 'shift-card.schema.json');

  const validateCard = ajv.compile(cardSchema);
  const validateCollection = ajv.compile(collectionSchema);

  return { validateCard, validateCollection };
}

// ─── File Discovery ──────────────────────────────────────

/**
 * Recursively find all .json files in a directory.
 * @param {string} dirPath - Absolute path to directory
 * @returns {string[]} Array of absolute file paths
 */
function findJsonFiles(dirPath) {
  const results = [];

  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (stat.isFile() && extname(entry).toLowerCase() === '.json') {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Validation ──────────────────────────────────────────

/**
 * Detect whether a JSON object is a collection or individual card.
 * @param {object} data - Parsed JSON data
 * @returns {'collection' | 'card'}
 */
function detectType(data) {
  if (data.collection && Array.isArray(data.cards)) {
    return 'collection';
  }
  return 'card';
}

/**
 * Format a single AJV error for display.
 * @param {object} error - AJV error object
 * @returns {string}
 */
function formatError(error) {
  const path = error.instancePath || '/';
  const message = error.message || 'unknown error';
  const params = error.params ? ` ${COLOR.dim}${JSON.stringify(error.params)}${COLOR.reset}` : '';

  return `    ${COLOR.red}→${COLOR.reset} ${COLOR.cyan}${path}${COLOR.reset} ${message}${params}`;
}

/**
 * Validate a single JSON file.
 * @param {string} filePath - Absolute path to JSON file
 * @param {{ validateCard: Function, validateCollection: Function }} validators
 * @returns {{ pass: boolean, filePath: string, errors: string[] }}
 */
function validateFile(filePath, validators) {
  const relPath = relative(PROJECT_ROOT, filePath);
  const result = { pass: false, filePath: relPath, errors: [] };

  // Read and parse
  let data;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  } catch (err) {
    result.errors.push(`    ${COLOR.red}→${COLOR.reset} Failed to parse JSON: ${err.message}`);
    return result;
  }

  // Detect type and validate
  const type = detectType(data);
  const validator = type === 'collection' ? validators.validateCollection : validators.validateCard;
  const valid = validator(data);

  if (valid) {
    result.pass = true;
    return result;
  }

  // Collect errors
  result.errors = (validator.errors || []).map(formatError);
  return result;
}

// ─── Main ────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
${COLOR.bold}SHIFT Card JSON Standard — Schema Validator${COLOR.reset}
${COLOR.dim}─────────────────────────────────────────────${COLOR.reset}

${COLOR.bold}Usage:${COLOR.reset}
  node tools/validate.js ${COLOR.cyan}<file.json>${COLOR.reset}          Validate a single card or collection
  node tools/validate.js ${COLOR.cyan}<directory/>${COLOR.reset}         Validate all .json files in directory
  node tools/validate.js ${COLOR.cyan}examples/${COLOR.reset}            Validate all example files

${COLOR.bold}Examples:${COLOR.reset}
  node tools/validate.js examples/example-hero.json
  node tools/validate.js examples/
`);
    process.exit(0);
  }

  // Resolve target path
  const target = resolve(args[0]);

  if (!existsSync(target)) {
    console.error(`${FAIL} File or directory not found: ${COLOR.cyan}${args[0]}${COLOR.reset}`);
    process.exit(1);
  }

  // Find files to validate
  let files;
  const stat = statSync(target);
  if (stat.isDirectory()) {
    files = findJsonFiles(target);
    if (files.length === 0) {
      console.error(`${WARN} No .json files found in ${COLOR.cyan}${args[0]}${COLOR.reset}`);
      process.exit(0);
    }
  } else {
    files = [target];
  }

  // Load schemas
  let validators;
  try {
    validators = loadSchemas();
  } catch (err) {
    console.error(`${FAIL} Failed to load schemas: ${err.message}`);
    process.exit(1);
  }

  // Validate each file
  console.log(`\n${COLOR.bold}SHIFT Card Standard v1.0 — Validating ${files.length} file(s)${COLOR.reset}`);
  console.log(`${COLOR.dim}${'─'.repeat(50)}${COLOR.reset}\n`);

  let passCount = 0;
  let failCount = 0;

  for (const file of files) {
    const result = validateFile(file, validators);

    if (result.pass) {
      console.log(`  ${PASS} ${COLOR.green}PASS${COLOR.reset}  ${result.filePath}`);
      passCount++;
    } else {
      console.log(`  ${FAIL} ${COLOR.red}FAIL${COLOR.reset}  ${result.filePath}`);
      for (const err of result.errors) {
        console.log(err);
      }
      console.log();
      failCount++;
    }
  }

  // Summary
  console.log(`\n${COLOR.dim}${'─'.repeat(50)}${COLOR.reset}`);
  console.log(`  ${COLOR.bold}Results:${COLOR.reset} ${COLOR.green}${passCount} passed${COLOR.reset}, ${failCount > 0 ? COLOR.red : COLOR.dim}${failCount} failed${COLOR.reset}`);
  console.log();

  process.exit(failCount > 0 ? 1 : 0);
}

main();
