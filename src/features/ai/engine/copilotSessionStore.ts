/**
 * Probe for Copilot CLI's saved sessions — the Copilot half of what
 * `commands/claudeSessionStore` does for Claude Code.
 *
 * Copilot CLI keeps each session in `~/.copilot/session-state/<id>/` (or under
 * `$COPILOT_HOME`), with a `workspace.yaml` that records the directory it ran in
 * (`cwd:`) and when it last changed (`updated_at:`). Verified against Copilot CLI
 * 1.0.91 on 2026-10-06; Copilot does not document the layout as a stable API.
 *
 * Why the session ID and not `--continue`: Copilot's `--continue` resumes "the most
 * recent session", and nothing says it is limited to the current directory. The
 * chat must never resume a conversation from some other folder, so the newest
 * session recorded FOR THIS DIRECTORY is found here and resumed by ID.
 *
 * Any filesystem error is treated as "no session" — starting fresh is safe,
 * resuming the wrong conversation is not.
 *
 * @module features/ai/engine/copilotSessionStore
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Copilot's state directory: `$COPILOT_HOME`, else `~/.copilot`. */
function copilotHome(): string {
    return process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
}

/** One `key: value` line of a flat YAML file, quotes removed. */
function readField(yaml: string, key: string): string | undefined {
    const match = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(yaml);
    if (!match) return undefined;
    return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
}

/**
 * The ID of the newest Copilot CLI session that ran in `cwd`, or `undefined` when
 * there is none (or the store cannot be read).
 */
export function latestCopilotSession(cwd: string): string | undefined {
    const root = path.join(copilotHome(), 'session-state');
    let newest: { id: string; updated: string } | undefined;
    try {
        for (const id of fs.readdirSync(root)) {
            let yaml: string;
            try {
                yaml = fs.readFileSync(path.join(root, id, 'workspace.yaml'), 'utf8');
            } catch {
                continue;
            }
            if (readField(yaml, 'cwd') !== cwd) continue;
            const updated = readField(yaml, 'updated_at') ?? '';
            if (!newest || updated > newest.updated) newest = { id, updated };
        }
    } catch {
        return undefined;
    }
    return newest?.id;
}
