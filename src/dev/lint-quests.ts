/**
 * Quest validation linter for v1 rules.
 *
 * This script validates all quests in src/infra/quests against the v1 validation rules.
 * It can be run with: npm run lint:quests
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative, posix } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import type { QuestNodeWithAvailability } from '../domain/quests.js';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Quest Discovery
// ============================================================================

/**
 * Recursively finds all TypeScript files in a directory.
 */
function findQuestFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      findQuestFiles(filePath, fileList);
    } else if (extname(file) === '.ts' && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 * Extracts quest exports from a TypeScript file by parsing it.
 * This is a simple parser that looks for exported const declarations.
 */
function extractQuestExports(filePath: string): Array<{ name: string; value: QuestNodeWithAvailability }> {
  const content = readFileSync(filePath, 'utf-8');
  const quests: Array<{ name: string; value: QuestNodeWithAvailability }> = [];

  // Look for exported const patterns like: export const questName: QuestNodeWithAvailability = { ... }
  // This is a simple regex-based approach. For production, consider using a proper TS parser.
  const exportPattern = /export\s+const\s+(\w+)\s*:\s*QuestNodeWithAvailability\s*=\s*({[\s\S]*?});/g;
  let match;

  while ((match = exportPattern.exec(content)) !== null) {
    const exportName = match[1];
    const questObjectStr = match[2];

    try {
      // Evaluate the quest object (this works because it's a simple object literal)
      // We need to handle the object properly - this is a simplified approach
      // For a more robust solution, we'd use a TypeScript compiler API
      const questValue = eval(`(${questObjectStr})`) as QuestNodeWithAvailability;
      quests.push({ name: exportName, value: questValue });
    } catch (e) {
      // If eval fails, we'll need to import the file differently
      // For now, we'll note this and continue
      console.error(`Warning: Could not parse quest export ${exportName} from ${filePath}`);
    }
  }

  return quests;
}

/**
 * Imports all quests from quest files.
 * Uses dynamic imports with proper path resolution for tsx.
 */
async function loadAllQuests(): Promise<Array<{ file: string; quest: QuestNodeWithAvailability }>> {
  const questsDir = join(__dirname, '../infra/quests');
  const questFiles = findQuestFiles(questsDir);
  const allQuests: Array<{ file: string; quest: QuestNodeWithAvailability }> = [];

  // Import all quest files dynamically
  for (const filePath of questFiles) {
    try {
      // Get relative path from this file's directory (src/dev/) to the quest file
      // Example: from src/dev/ to src/infra/quests/v1-quest.ts -> ../infra/quests/v1-quest
      const relativePath = relative(__dirname, filePath);
      // Convert to posix path and remove .ts extension, add .js for import
      const importPath = relativePath.replace(/\\/g, '/').replace(/\.ts$/, '.js');

      // Dynamic import (tsx will handle .ts files via .js extension in import)
      const module = await import(importPath);

      // Find all exports that match QuestNodeWithAvailability pattern
      for (const [exportName, exportValue] of Object.entries(module)) {
        if (
          exportValue &&
          typeof exportValue === 'object' &&
          'id' in exportValue &&
          'type' in exportValue &&
          'context' in exportValue &&
          'realWorldAction' in exportValue &&
          'constraint' in exportValue &&
          'consequence' in exportValue &&
          'availability' in exportValue
        ) {
          allQuests.push({
            file: filePath,
            quest: exportValue as QuestNodeWithAvailability,
          });
        }
      }
    } catch (error) {
      console.error(`Error importing ${filePath}:`, error);
      // Continue with other files instead of throwing
    }
  }

  return allQuests;
}

// ============================================================================
// Validation Rules
// ============================================================================

interface ValidationError {
  file: string;
  questId: string;
  rule: string;
  message: string;
}

/**
 * Guilt/shame phrases to reject.
 */
const GUILT_SHAME_PHRASES = [
  'should have',
  'lazy',
  'failed',
  'make up for',
  'no excuses',
];

/**
 * Checks if text contains guilt/shame phrases (case-insensitive).
 */
function containsGuiltShame(text: string): boolean {
  const lower = text.toLowerCase();
  return GUILT_SHAME_PHRASES.some((phrase) => lower.includes(phrase));
}

/**
 * Validates a single quest against v1 rules.
 */
function validateQuest(
  file: string,
  quest: QuestNodeWithAvailability
): ValidationError[] {
  const errors: ValidationError[] = [];
  const questId = quest.id || '<unknown>';

  // Rule: id non-empty string
  if (!quest.id || typeof quest.id !== 'string' || quest.id.trim() === '') {
    errors.push({
      file,
      questId,
      rule: 'id-non-empty',
      message: 'id must be a non-empty string',
    });
  }

  // Rule: type is one of 'agency' | 'courage' | 'order'
  if (!['agency', 'courage', 'order'].includes(quest.type)) {
    errors.push({
      file,
      questId,
      rule: 'type-valid',
      message: `type must be one of 'agency' | 'courage' | 'order', got: ${quest.type}`,
    });
  }

  // Rule: context, realWorldAction, constraint are non-empty strings
  if (!quest.context || typeof quest.context !== 'string' || quest.context.trim() === '') {
    errors.push({
      file,
      questId,
      rule: 'context-non-empty',
      message: 'context must be a non-empty string',
    });
  }

  if (
    !quest.realWorldAction ||
    typeof quest.realWorldAction !== 'string' ||
    quest.realWorldAction.trim() === ''
  ) {
    errors.push({
      file,
      questId,
      rule: 'realWorldAction-non-empty',
      message: 'realWorldAction must be a non-empty string',
    });
  }

  if (
    !quest.constraint ||
    typeof quest.constraint !== 'string' ||
    quest.constraint.trim() === ''
  ) {
    errors.push({
      file,
      questId,
      rule: 'constraint-non-empty',
      message: 'constraint must be a non-empty string',
    });
  }

  // Rule: If reflection exists: non-empty string
  if (quest.reflection !== undefined) {
    if (typeof quest.reflection !== 'string' || quest.reflection.trim() === '') {
      errors.push({
        file,
        questId,
        rule: 'reflection-non-empty',
        message: 'reflection must be a non-empty string if provided',
      });
    }
  }

  // Rule: consequence exists and changes something
  if (!quest.consequence) {
    errors.push({
      file,
      questId,
      rule: 'consequence-exists',
      message: 'consequence must exist',
    });
  } else {
    const hasStatChanges =
      quest.consequence.statChanges &&
      Object.keys(quest.consequence.statChanges).length > 0;
    const hasFlagsToSet =
      quest.consequence.flagsToSet && quest.consequence.flagsToSet.length > 0;
    const hasFlagsToClear =
      quest.consequence.flagsToClear &&
      quest.consequence.flagsToClear.length > 0;
    const hasUnlocksQuests =
      quest.consequence.unlocksQuests &&
      quest.consequence.unlocksQuests.length > 0;

    if (!hasStatChanges && !hasFlagsToSet && !hasFlagsToClear && !hasUnlocksQuests) {
      errors.push({
        file,
        questId,
        rule: 'consequence-changes-something',
        message:
          'consequence must change something (statChanges, flagsToSet, flagsToClear, or unlocksQuests)',
      });
    }
  }

  // Rule: availability exists (can be empty object)
  if (!quest.availability) {
    errors.push({
      file,
      questId,
      rule: 'availability-exists',
      message: 'availability must exist (can be empty object)',
    });
  }

  // Rule: constraint must end with punctuation
  if (quest.constraint) {
    const trimmed = quest.constraint.trim();
    if (trimmed.length > 0 && !/[.!?]$/.test(trimmed)) {
      errors.push({
        file,
        questId,
        rule: 'constraint-punctuation',
        message: 'constraint must end with punctuation (. ! or ?)',
      });
    }
  }

  // Rule: Length caps
  if (quest.context && quest.context.length > 360) {
    errors.push({
      file,
      questId,
      rule: 'context-length',
      message: `context must be <= 360 chars, got ${quest.context.length}`,
    });
  }

  if (quest.realWorldAction && quest.realWorldAction.length > 240) {
    errors.push({
      file,
      questId,
      rule: 'realWorldAction-length',
      message: `realWorldAction must be <= 240 chars, got ${quest.realWorldAction.length}`,
    });
  }

  if (quest.constraint && quest.constraint.length > 240) {
    errors.push({
      file,
      questId,
      rule: 'constraint-length',
      message: `constraint must be <= 240 chars, got ${quest.constraint.length}`,
    });
  }

  if (quest.reflection && quest.reflection.length > 140) {
    errors.push({
      file,
      questId,
      rule: 'reflection-length',
      message: `reflection must be <= 140 chars, got ${quest.reflection.length}`,
    });
  }

  // Rule: Optional - reject guilt/shame phrases
  const textFields = [
    { name: 'context', value: quest.context },
    { name: 'realWorldAction', value: quest.realWorldAction },
    { name: 'constraint', value: quest.constraint },
    { name: 'reflection', value: quest.reflection },
  ];

  for (const field of textFields) {
    if (field.value && containsGuiltShame(field.value)) {
      errors.push({
        file,
        questId,
        rule: 'no-guilt-shame',
        message: `${field.name} contains guilt/shame language`,
      });
    }
  }

  return errors;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Linting quests...\n');

  const allQuests = await loadAllQuests();
  const allErrors: ValidationError[] = [];

  for (const { file, quest } of allQuests) {
    const errors = validateQuest(file, quest);
    allErrors.push(...errors);
  }

  if (allErrors.length === 0) {
    console.log('✓ All quests valid\n');
    process.exit(0);
  }

  // Print report
  console.log('✗ Validation failures:\n');

  // Group by file
  const errorsByFile = new Map<string, ValidationError[]>();
  for (const error of allErrors) {
    if (!errorsByFile.has(error.file)) {
      errorsByFile.set(error.file, []);
    }
    errorsByFile.get(error.file)!.push(error);
  }

  for (const [file, errors] of errorsByFile.entries()) {
    console.log(`File: ${file}`);
    for (const error of errors) {
      console.log(`  Quest: ${error.questId}`);
      console.log(`  Rule: ${error.rule}`);
      console.log(`  Error: ${error.message}`);
      console.log('');
    }
  }

  console.log(`Total: ${allErrors.length} error(s) across ${errorsByFile.size} file(s)\n`);
  process.exit(1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
