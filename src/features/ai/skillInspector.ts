/**
 * Skill Inspector (Cycle C Step 9)
 *
 * Walks `<project>/.claude/skills/` and returns a `SkillInventoryEntry[]`.
 * Classifies each skill by where it lives on disk:
 *
 *   - Top-level `add-component.md` / `sync-changes.md` / `update-credentials.md`
 *     → 'demo-builder' (matches the three lifecycle skills `skillsWriter`
 *     writes during project finalization).
 *   - Any `.md` nested under a subdirectory of `skills/` → 'adobe'
 *     (`skillsWriter` only creates subdirectories for Adobe skill bundles
 *     copied from `@adobe-commerce/commerce-extensibility-tools`).
 *   - Anything else at the top level → 'unknown'.
 *
 * Parses YAML frontmatter using the same regex + `yaml.parse` shape as
 * `skillsWriter::rewriteNameFrontmatter`. Falls back to the filename basename
 * when `name:` is missing; `description:` becomes `null` when absent.
 *
 * Pure `fs/promises` — no VS Code coupling.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import type { SkillInventoryEntry, SkillSource } from '@/types/ai';

const DEMO_BUILDER_SKILL_FILES: ReadonlySet<string> = new Set([
    'add-component.md',
    'sync-changes.md',
    'update-credentials.md',
]);

/**
 * Walk `<project>/.claude/skills/` and return one entry per `.md` file found.
 * Missing skills directory returns `[]`; other IO errors propagate.
 */
export async function inspectSkills(projectPath: string): Promise<SkillInventoryEntry[]> {
    const skillsDir = path.join(projectPath, '.claude', 'skills');

    let topLevel: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
    try {
        topLevel = await fsPromises.readdir(skillsDir, { withFileTypes: true });
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
    }

    const results: SkillInventoryEntry[] = [];
    for (const entry of topLevel) {
        const entryPath = path.join(skillsDir, entry.name);

        if (entry.isFile() && entry.name.endsWith('.md')) {
            const source: SkillSource = DEMO_BUILDER_SKILL_FILES.has(entry.name)
                ? 'demo-builder'
                : 'unknown';
            results.push(await readSkillFile(entryPath, source));
        } else if (entry.isDirectory()) {
            const nestedMd = await collectMdFiles(entryPath);
            for (const nestedPath of nestedMd) {
                results.push(await readSkillFile(nestedPath, 'adobe'));
            }
        }
    }

    return results;
}

/** Recursively collect all `.md` file paths under `dir`. */
async function collectMdFiles(dir: string): Promise<string[]> {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
        const childPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.md')) {
            out.push(childPath);
        } else if (entry.isDirectory()) {
            out.push(...(await collectMdFiles(childPath)));
        }
    }
    return out;
}

async function readSkillFile(filePath: string, source: SkillSource): Promise<SkillInventoryEntry> {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return {
        name: typeof frontmatter.name === 'string' && frontmatter.name.length > 0
            ? frontmatter.name
            : path.basename(filePath, '.md'),
        description: typeof frontmatter.description === 'string' ? frontmatter.description : null,
        path: filePath,
        source,
    };
}

/**
 * Parse YAML frontmatter (between `---` delimiters) from a Markdown file.
 * Returns `{}` when the file has no frontmatter block or the YAML is invalid.
 *
 * Matches the regex + `yaml.parse` shape used by
 * `skillsWriter::rewriteNameFrontmatter` so the two writers agree on what
 * counts as valid frontmatter.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
    if (!match) return {};
    try {
        const parsed = yaml.parse(match[1]) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}
