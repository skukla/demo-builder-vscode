/**
 * Claude Settings Writer
 *
 * Builds and merges `.claude/settings.json` content — the PostToolUse git-sync
 * hook for EDS projects (per-project and home variants) and the edit-preserving
 * merge that keeps a user's own hooks / permissions / env intact on regenerate.
 *
 * Extracted verbatim from `mcpConfigWriter.ts` (which kept the MCP config file
 * writing) to keep both modules under the line budget. `writeMcpConfigs` is
 * the production consumer of `generateClaudeSettings` + `mergeClaudeSettings` +
 * `readExistingSettings`; `homeAiContextWriter` consumes
 * `generateHomeClaudeSettings`.
 *
 * The PostToolUse hook reads the tool-call JSON on STDIN and takes
 * `tool_input.file_path`, matching every hook in this repo's own
 * `.claude/hooks/`. It previously read a `$CLAUDE_TOOL_INPUT` env var that
 * Claude Code never sets, so it silently did nothing; the extractor is now
 * pinned by tests that EXECUTE it rather than grep the command string.
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';

// ─── Claude Settings types ────────────────────────────────────────────────────

interface HookEntry {
    type: string;
    command: string;
}

interface PostToolUseHook {
    matcher: string;
    hooks: HookEntry[];
}

export interface ClaudeSettings {
    hooks?: {
        PostToolUse?: PostToolUseHook[];
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate .claude/settings.json with PostToolUse git sync hook.
 * Hook is only added when the project has an EDS storefront with a local path
 * and that path (and `nodePath`, interpolated into the hook) contains no shell
 * metacharacters.
 *
 * `nodePath` is the already-resolved Node binary (see `resolveNodePath` in
 * `mcpConfigWriter`) used by the hook's `node -e` tool-input extractor.
 */
export function generateClaudeSettings(project: Project, nodePath: string): ClaudeSettings {
    const storefrontPath = resolveStorefrontPath(project);
    if (!storefrontPath) {
        return {};
    }

    const command = buildGitSyncCommand(storefrontPath, nodePath);
    if (!command) {
        // Path contained shell metacharacters — skip hook for safety
        return {};
    }

    return {
        hooks: {
            PostToolUse: [
                {
                    matcher: 'Write|Edit',
                    hooks: [{ type: 'command', command }],
                },
            ],
        },
    };
}

/**
 * Stable signature of the Demo-Builder git-sync PostToolUse hook — the commit
 * message it always emits. Used to find (and refresh, not duplicate) our own
 * entry among a user's `.claude/settings.json` PostToolUse hooks without a
 * separate marker field (the Claude Code hook schema has none).
 */
const GIT_SYNC_SIGNATURE = 'AI: sync files';

/** True when a PostToolUse entry is the Demo-Builder git-sync hook. */
function isGitSyncHook(entry: PostToolUseHook | undefined): boolean {
    // Guard the shape — this parses a user-authored file; a malformed entry must
    // not throw and abort the whole regenerate.
    const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
    return hooks.some(
        (h) => typeof h?.command === 'string' && h.command.includes(GIT_SYNC_SIGNATURE),
    );
}

/**
 * Merge the Demo-Builder git-sync hook into an existing settings.json,
 * preserving everything the user owns (permissions, env, other hook types, and
 * their own PostToolUse hooks). Our git-sync entry is dropped-then-re-added so a
 * changed storefront path refreshes it rather than duplicating; when `desired`
 * carries no git-sync hook (non-EDS / unsafe path) ours is simply removed and the
 * rest of the user's settings survive (vs the old wholesale overwrite with `{}`).
 */
export function mergeClaudeSettings(
    existing: Record<string, unknown>,
    desired: ClaudeSettings,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };

    const existingHooks = { ...((existing.hooks as Record<string, unknown>) ?? {}) };
    const existingPostToolUse = Array.isArray(existingHooks.PostToolUse)
        ? (existingHooks.PostToolUse as PostToolUseHook[])
        : [];

    // Keep the user's own PostToolUse hooks; drop any prior git-sync entry.
    const userPostToolUse = existingPostToolUse.filter((entry) => !isGitSyncHook(entry));
    const desiredGitSync = (desired.hooks?.PostToolUse ?? []).filter(isGitSyncHook);
    const nextPostToolUse = [...userPostToolUse, ...desiredGitSync];

    if (nextPostToolUse.length > 0) {
        existingHooks.PostToolUse = nextPostToolUse;
    } else {
        delete existingHooks.PostToolUse;
    }

    if (Object.keys(existingHooks).length > 0) {
        merged.hooks = existingHooks;
    } else {
        delete merged.hooks;
    }
    return merged;
}

/**
 * Generate .claude/settings.json for the SINGLE home Chat (rooted at the Demo
 * Builder projects root). Installs a project-aware PostToolUse git-sync hook
 * that auto-commits/pushes storefront edits made anywhere under the projects
 * root — the home analogue of the per-project hook.
 *
 * Returns `{}` (no hook) when `projectsRoot` (or `nodePath`, interpolated into
 * the hook) contains shell metacharacters — an attacker-controlled value must
 * not become part of an executed shell command.
 *
 * `nodePath` is the already-resolved Node binary (see `resolveNodePath` in
 * `mcpConfigWriter`) used by the hook's `node -e` tool-input extractor.
 */
export function generateHomeClaudeSettings(projectsRoot: string, nodePath: string): ClaudeSettings {
    const command = buildHomeGitSyncCommand(projectsRoot, nodePath);
    if (!command) {
        // Root contained shell metacharacters — skip hook for safety
        return {};
    }

    return {
        hooks: {
            PostToolUse: [
                {
                    matcher: 'Write|Edit',
                    hooks: [{ type: 'command', command }],
                },
            ],
        },
    };
}

/**
 * Read + parse an existing `.claude/settings.json` content string. Returns `{}`
 * when the content is absent or unparseable — a broken file can't be merged
 * into, and Claude Code couldn't read it either, so a fresh write is the safe
 * recovery.
 */
export function parseExistingSettings(content: string | undefined): Record<string, unknown> {
    if (content === undefined) return {};
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function resolveStorefrontPath(project: Project): string | undefined {
    return project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
}

/**
 * Shell metacharacters that could enable injection in the hook command.
 * Includes: quotes/backtick (`"'\`), variable expansion ($), command separators (;|&),
 * redirects (<>), escapes (\\), globs (*?[]), process substitution ((){}), and newlines.
 *
 * Whitespace is allowed — macOS users often have paths containing spaces
 * (e.g., `/Users/Some User/...`), and the command quotes the path properly.
 */
const SHELL_METACHAR_RE = /["`$;|&<>\n\r\\'*?[\](){}]/;

/**
 * Build the shell snippet that extracts the edited file path from the
 * PostToolUse payload into `$TOOL_FILE`.
 *
 * Reads the tool-call JSON from STDIN, which is how Claude Code delivers it.
 * This previously read `process.env.CLAUDE_TOOL_INPUT` — an env var Claude Code
 * does not set — so `TOOL_FILE` was always empty, the path guard never matched,
 * and the hook silently did nothing on every EDS project ever generated. The
 * original author flagged the assumption as unverified; it was wrong.
 *
 * Ground truth is this repo's own `.claude/hooks/`: all nine read stdin and take
 * `tool_input.file_path`, and `format-on-edit.sh` is the same
 * PostToolUse/`Edit|Write` pair as this hook.
 *
 * Parsed with a single `node -e` invocation using the already-resolved Node
 * binary (the same one the MCP proxy depends on) — no `jq`/`python3`/`grep`+`sed`
 * cascade. The Node one-liner:
 *   - reads fd 0 to end (defaulting to `"{}"` when empty),
 *   - `JSON.parse`s it inside try/catch (parse failure ⇒ prints nothing),
 *   - recursively finds the FIRST string-valued `file_path` at any nesting depth
 *     (parity with the old `.. | .file_path` recursion; Claude passes it at
 *     `tool_input.file_path`),
 *   - writes that path (or empty string) to stdout with NO trailing newline.
 *
 * The JS contains NO single-quote characters, so the whole `-e '…'` is wrapped
 * in single quotes with no escaping. `nodePath` is interpolated double-quoted.
 * Shared by the per-project and the home git-sync hooks. Callers guard
 * `nodePath` with `SHELL_METACHAR_RE` before interpolating it here.
 */
function buildToolFileExtraction(nodePath: string): string {
    // No single quotes anywhere in this script — it is wrapped in single quotes
    // for the shell. Double quotes only. Reads the payload from stdin, recurses
    // for the first string file_path, and writes it with no trailing newline.
    const script =
        `try{` +
        `var o=JSON.parse(require("fs").readFileSync(0,"utf8")||"{}");` +
        `var f=function(v){` +
        `if(v&&typeof v==="object"){` +
        `if(typeof v.file_path==="string")return v.file_path;` +
        `for(var k in v){var r=f(v[k]);if(typeof r==="string")return r}` +
        `}` +
        `return null` +
        `};` +
        `var p=f(o);` +
        `if(typeof p==="string")process.stdout.write(p)` +
        `}catch(e){}`;

    return `TOOL_FILE=$("${nodePath}" -e '${script}'); `;
}

/**
 * Build the PostToolUse git sync shell command for the storefront path.
 *
 * Returns an empty string (no hook installed) if `storefrontPath` contains
 * shell metacharacters — an attacker-controlled path must not become part of
 * an executed shell command.
 *
 * Extracts the edited file into `$TOOL_FILE` (see `buildToolFileExtraction`),
 * then commits + pushes only when that file is under the storefront path.
 *
 * `nodePath` is interpolated into the extractor command, so it is subject to
 * the same `SHELL_METACHAR_RE` guard as `storefrontPath`.
 */
function buildGitSyncCommand(storefrontPath: string, nodePath: string): string {
    if (SHELL_METACHAR_RE.test(storefrontPath) || SHELL_METACHAR_RE.test(nodePath)) {
        // Unsafe path — skip hook rather than risk shell injection
        return '';
    }

    // SHELL_METACHAR_RE already rejects any quote characters, so no further
    // escaping of storefrontPath is needed before interpolating into double-quoted
    // shell arguments. The double quotes preserve any spaces.
    const quoted = `"${storefrontPath}"`;

    return (
        buildToolFileExtraction(nodePath) +
        `if [[ "$TOOL_FILE" == ${quoted}* ]]; then ` +
        `git -C ${quoted} add -A && ` +
        `git -C ${quoted} commit -m "${GIT_SYNC_SIGNATURE}" && ` +
        `git -C ${quoted} push; fi`
    );
}

/**
 * Build the project-aware PostToolUse git-sync command for the SINGLE home Chat
 * (rooted at the Demo Builder projects root). Auto-commits/pushes a storefront
 * edit made anywhere under `<root>/<project>/...` — the home analogue of the
 * per-project `buildGitSyncCommand`.
 *
 * Unlike the per-project hook (which targets one fixed storefront path), the
 * home Chat can edit ANY project under the root, so this command resolves the
 * enclosing git repo at runtime and applies layered safety guards:
 *
 *   1. Returns `''` (no hook) if `projectsRoot` (or `nodePath`, interpolated into
 *      the extractor) contains shell metacharacters — an attacker-controlled
 *      value must never become part of a shell command. Same guard as
 *      `buildGitSyncCommand`.
 *   2. Extracts the edited file into `$TOOL_FILE`; `[ -z … ] && exit 0` bails
 *      when nothing was edited or the payload couldn't be parsed.
 *   3. Resolves the enclosing repo via `git rev-parse --show-toplevel` from the
 *      edited file's directory; `|| exit 0` bails when the file isn't in a repo.
 *   4. ROOT-SCOPE guard: `case "$TOP" in "<root>"/*) … *) exit 0` — only proceed
 *      when the repo top is strictly UNDER the projects root. `"<root>"/*`
 *      requires a subpath, so the root itself (and files written directly under
 *      it, e.g. `.claude/`) never trigger a commit.
 *   5. REMOTE guard: `git remote get-url origin || exit 0` — only repos that
 *      have an `origin` remote (i.e. the storefront repos Helix watches). Never
 *      commit+push a random non-remote repo a user happens to have under root.
 *   6. Commit + push the resolved repo top.
 *
 * The root is double-quoted everywhere it is interpolated. The metachar guard
 * already rejects quotes, so quoting is purely to preserve spaces in the path.
 */
export function buildHomeGitSyncCommand(projectsRoot: string, nodePath: string): string {
    if (SHELL_METACHAR_RE.test(projectsRoot) || SHELL_METACHAR_RE.test(nodePath)) {
        // Unsafe root — skip hook rather than risk shell injection
        return '';
    }

    // SHELL_METACHAR_RE already rejects any quote characters, so no further
    // escaping is needed before interpolating into double-quoted shell
    // arguments. The double quotes preserve any spaces in the root path.
    const quotedRoot = `"${projectsRoot}"`;

    return (
        buildToolFileExtraction(nodePath) +
        `[ -z "$TOOL_FILE" ] && exit 0; ` +
        `TOP=$(git -C "$(dirname "$TOOL_FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0; ` +
        `case "$TOP" in ${quotedRoot}/*) ;; *) exit 0 ;; esac; ` +
        `git -C "$TOP" remote get-url origin >/dev/null 2>&1 || exit 0; ` +
        `git -C "$TOP" add -A && ` +
        `git -C "$TOP" commit -m "${GIT_SYNC_SIGNATURE}" && ` +
        `git -C "$TOP" push`
    );
}
