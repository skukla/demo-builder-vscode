/**
 * Skill Inspector
 *
 * Walks `<project>/.claude/skills/` and returns a `SkillInventoryEntry[]`.
 * Classifies each skill by where it lives on disk:
 *
 *   - Any top-level DIRECTORY whose name is in `DEMO_BUILDER_SKILL_NAMES`
 *     → 'demo-builder' (the `<name>/SKILL.md` layout skillsWriter emits since
 *     v24 — the one layout Claude Code registers as an invocable skill). That
 *     set is imported from `@/types/ai`, NOT redeclared here — `skillsWriter`
 *     builds its write list from the same constant. The two used to keep
 *     separate copies and drifted (`diagnose-demo` was written but not
 *     recognised, so it showed as a user-authored "Custom" skill).
 *   - A top-level `<name>.md` whose stem is in that set → 'demo-builder' too:
 *     the legacy pre-v27 flat layout, still first-party on projects not yet
 *     regenerated.
 *   - Any `.md` nested under any OTHER subdirectory of `skills/` → 'adobe',
 *     carrying the directory's `<prefix>-` as `bundle` (`aem`, `appbuilder`).
 *     The prefix is what separates one Adobe bundle from another; discarding
 *     it is what made App Builder skills render under an "Adobe AEM" heading.
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
import { DEMO_BUILDER_SKILL_NAMES, type SkillInventoryEntry, type SkillSource } from '@/types/ai';

/**
 * The bundle prefix `copyAdobeSkillBundle` stamped onto a directory it created,
 * which names it `<prefix>-<skillName>`. Returns undefined when there is no
 * separator, so an unprefixed directory reports no bundle rather than a guess.
 */
function bundlePrefixOf(dirName: string): string | undefined {
    const separator = dirName.indexOf('-');
    return separator > 0 ? dirName.slice(0, separator) : undefined;
}

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
            // Legacy pre-v27 flat layout — still first-party by stem.
            const source: SkillSource = DEMO_BUILDER_SKILL_NAMES.has(
                path.basename(entry.name, '.md'),
            )
                ? 'demo-builder'
                : 'unknown';
            results.push(await readSkillFile(entryPath, source));
        } else if (entry.isDirectory() && DEMO_BUILDER_SKILL_NAMES.has(entry.name)) {
            // First-party `<name>/SKILL.md` layout (v27+). No bundle: the
            // directory name IS the skill, not an Adobe bundle prefix — and it
            // is also the name fallback (basename would say "SKILL").
            const nestedMd = await collectMdFiles(entryPath);
            for (const nestedPath of nestedMd) {
                results.push(
                    await readSkillFile(nestedPath, 'demo-builder', undefined, entry.name),
                );
            }
        } else if (entry.isDirectory()) {
            // The bundle comes from THIS directory's name, not from wherever the
            // file sits beneath it — a skill nested two levels deep still belongs
            // to the bundle whose directory it arrived in.
            const bundle = bundlePrefixOf(entry.name);
            const nestedMd = await collectMdFiles(entryPath);
            for (const nestedPath of nestedMd) {
                results.push(await readSkillFile(nestedPath, 'adobe', bundle));
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

async function readSkillFile(
    filePath: string,
    source: SkillSource,
    bundle?: string,
    fallbackName?: string,
): Promise<SkillInventoryEntry> {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return {
        name:
            typeof frontmatter.name === 'string' && frontmatter.name.length > 0
                ? frontmatter.name
                : (fallbackName ?? path.basename(filePath, '.md')),
        description: typeof frontmatter.description === 'string' ? frontmatter.description : null,
        path: filePath,
        source,
        bundle,
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
