/**
 * Probe for Claude Code's per-cwd conversation store.
 *
 * Claude Code persists session transcripts under
 * `~/.claude/projects/<encoded-cwd>/<session>.jsonl`. The encoding maps the
 * absolute working directory to a single segment by replacing every `/`
 * AND every `.` with `-` (verified empirically — Claude Code does not
 * document the scheme as a stable API). The dot-replacement matters for
 * dot-prefixed directories like `~/.demo-builder/projects/<name>`, which
 * Claude Code stores at `-Users-<user>--demo-builder-projects-<name>`
 * with a double-hyphen where the leading dot lives. Omitting the dot
 * rule lands us at the wrong path and we miss live sessions.
 *
 * Used by `OpenInClaudeCommand` to decide whether `claude --continue` is
 * safe at launch. Cold-start invocations of `--continue` exit with
 * "No conversation found to continue" and a non-zero status; calling
 * `claude` alone (or `claude -- '<prompt>'`) instead starts a fresh
 * session without erroring.
 *
 * Any filesystem error is treated as a cold start — safer to omit
 * `--continue` than to error out at launch.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Returns `true` when Claude Code has at least one persisted session
 * transcript for the given cwd. `false` on cold start or any error.
 */
export function hasConversation(cwd: string): boolean {
    try {
        const encoded = cwd.replace(/[/.]/g, '-');
        const sessionsDir = path.join(os.homedir(), '.claude', 'projects', encoded);
        const entries = fs.readdirSync(sessionsDir);
        return entries.some((name) => name.endsWith('.jsonl'));
    } catch {
        return false;
    }
}
