/**
 * Security guards for the file-based MCP project tools.
 *
 * Everything that decides whether a path or a payload may be touched at all:
 * project-name validation + path resolution, the inside-the-project
 * canonical-path check, the `.env` content allowlist (the one that closed the
 * assignment-prefix RCE class), the config-path allowlist, and the manifest
 * read that locates the EDS storefront.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23).
 * `resolveProjectPath` and `validateEnvContent` keep their public identity via
 * re-export from `mcp-server.ts`.
 *
 * @module mcp/projectSecurity
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { assertPathInside, assertPathInsideSync } from '@/core/validation/PathSafetyValidator';

/** Regex for safe project directory names — no path separators, traversal, or null bytes */
const SAFE_PROJECT_NAME = /^[^/\\.\0][^/\\\0]*$/;

/**
 * Validate projectName is a safe directory name and resolve to an absolute path
 * inside projectsDir. Prevents path traversal via crafted project names.
 *
 * @throws Error if projectName contains path separators, `..`, or null bytes
 * @internal — exported for unit tests
 */
export function resolveProjectPath(projectsDir: string, projectName: string): string {
    if (
        !projectName ||
        !SAFE_PROJECT_NAME.test(projectName) ||
        projectName === '..' ||
        projectName.includes('..')
    ) {
        throw new Error(`Invalid project name: ${projectName}`);
    }
    const resolved = path.join(projectsDir, projectName);
    assertPathInsideSync(resolved, projectsDir);
    return resolved;
}

/**
 * Validate that `resolved` is inside `projectPath`, returning canonical paths
 * for downstream allowlist checks (e.g., isAllowedConfigPath).
 */
export async function assertInsideProject(
    projectPath: string,
    resolved: string,
): Promise<{ realProjectPath: string; realResolved: string }> {
    // Canonicalize projectPath first, then pass the canonical base to assertPathInside.
    // This avoids a redundant realpath call on the base inside assertPathInside.
    let realProjectPath: string;
    try {
        realProjectPath = await fsPromises.realpath(projectPath);
    } catch {
        realProjectPath = projectPath;
    }
    const realResolved = await assertPathInside(resolved, realProjectPath);
    return { realProjectPath, realResolved };
}

// Values that pass this regex are safe to source unquoted — no shell expansion, no
// word splitting, no glob, no redirection, no command invocation. The allowlist is
// intentionally narrow: URL query strings (with `?` or `&`), values with whitespace,
// tildes, and other common but unsafe characters must be quoted.
const SAFE_UNQUOTED_VALUE = /^[A-Za-z0-9_.:/@+,=%-]*$/;
// Single-quoted values are literal — no expansion, no escape processing. Embedded
// single quotes would close the quoting, so they are disallowed.
const SINGLE_QUOTED_VALUE = /^'[^']*'$/;
// Double-quoted values permit most characters, but `$`, backtick, and `\` trigger
// expansion/escaping on source. Disallow all three to keep the value inert.
const DOUBLE_QUOTED_VALUE_NO_EXPANSION = /^"[^"$`\\]*"$/;

/**
 * Validate the content of a .env file before writing.
 *
 * Allowlist approach (supersedes prior denylist). A value is accepted if and only if:
 *   - It is empty (`KEY=`), OR
 *   - It matches {@link SAFE_UNQUOTED_VALUE}: alphanumeric + `_.:/@+,=%-`, OR
 *   - It is single-quoted with no embedded `'`, OR
 *   - It is double-quoted with no `$`, backtick, or `\` inside.
 *
 * Defense-in-depth rationale: the MCP server lets AI agents write `.env` content that
 * a user's startup scripts may then `source`. Denylist approaches (block `$(`, then
 * `<(`, then `>`, then whitespace, then globs...) leak — three prior review iterations
 * found four distinct bypasses, culminating in a confirmed RCE via the bash
 * `VAR=value command args` assignment-prefix grammar. The allowlist closes that class
 * of bypasses in one rule.
 *
 * Specific-category guards (subshell, process substitution, parameter expansion,
 * shell metacharacters) still run for improved error messages — they help AI agents
 * diagnose and correct their output. The allowlist is the final safety net.
 *
 * @throws {Error} on the first line that fails validation.
 * @internal — exported only for unit tests
 */
export function validateEnvContent(content: string): void {
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) {
            throw new Error(
                `Invalid .env line (must be KEY=VALUE, a comment, or blank): ${trimmed.slice(0, 80)}`,
            );
        }
        const value = trimmed.slice(trimmed.indexOf('=') + 1);

        // Quoted escape hatches — short-circuit on properly-formed quoted values so the
        // specific guards below do not false-positive on literal `$(` inside single quotes.
        if (SINGLE_QUOTED_VALUE.test(value) || DOUBLE_QUOTED_VALUE_NO_EXPANSION.test(value))
            continue;

        // Specific guards for clearer error messages on common dangerous unquoted patterns.
        // These do not change the set of rejected values (the final allowlist already rejects
        // them); they produce category-specific errors that help AI agents self-correct.
        if (/\$\(/.test(value) || /`/.test(value)) {
            throw new Error(`.env value must not contain subshell syntax ($(...) or backticks)`);
        }
        if (/[<>=]\(/.test(value)) {
            throw new Error(
                '.env value must not contain process substitution syntax (<(...), >(...), or =(...))',
            );
        }
        if (/\$[A-Za-z_0-9@?!#*$\-{]/.test(value)) {
            throw new Error(
                '.env value must not contain shell parameter expansion ($VAR, ${VAR}, $1, $@, etc.)',
            );
        }
        if (/[<>|&;]/.test(value)) {
            throw new Error(
                '.env value must not contain unquoted shell metacharacters (<, >, |, &, ;) — quote the value if it needs these characters',
            );
        }

        // Allowlist backstop. Catches remaining dangerous grammar not hit by the specific
        // guards above: whitespace (prefix-env command invocation `KEY=x whoami`), glob
        // metacharacters (`*`, `?`, `[`), tilde expansion (`~`), brace expansion (`{a,b}`),
        // deprecated arithmetic (`$[...]`), and any other character outside the safe set.
        if (value === '' || SAFE_UNQUOTED_VALUE.test(value)) continue;
        throw new Error(
            `.env value must be safe-chars-only, single-quoted, or double-quoted without expansion: ${value.slice(0, 80)}`,
        );
    }
}

/**
 * Check if a canonical path is on the allowlist. Both arguments must be canonicalized
 * (via realpath) by the caller — otherwise a symlinked `.demo-builder.json` could pass
 * this check while the actual write lands on the symlink target. `assertInsideProject`
 * returns canonical paths for exactly this purpose.
 */
export function isAllowedConfigPath(realProjectPath: string, realResolved: string): boolean {
    if (realResolved === path.resolve(realProjectPath, '.demo-builder.json')) return true;
    // Allow .env files anywhere inside the project, excluding node_modules and .git
    // (AI agents need to update component .env files at any nesting level).
    if (path.basename(realResolved) === '.env') {
        const rel = path.relative(realProjectPath, realResolved);
        const parts = rel.split(path.sep);
        if (!rel.startsWith('..') && !parts.includes('node_modules') && !parts.includes('.git')) {
            return true;
        }
    }
    return false;
}

/**
 * Read the project manifest and extract the EDS storefront path.
 * @throws Error if no EDS storefront is configured
 */
export async function resolveStorefrontPath(projectPath: string): Promise<string> {
    const raw = await fsPromises.readFile(path.join(projectPath, '.demo-builder.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    const storefrontPath = manifest?.componentInstances?.['eds-storefront']?.path;
    if (!storefrontPath) {
        throw new Error('No EDS storefront configured for this project');
    }
    return storefrontPath;
}
