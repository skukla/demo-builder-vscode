/**
 * Is Claude Code — the command-line tool, `claude` — installed? (AI-4a)
 *
 * Asked by two places that used to assume it: "Open in Claude Code", which typed
 * `claude …` into a terminal and left a user without it at `command not found`,
 * and the dashboard's "AI Ready" badge, which stayed green for the same user.
 *
 * The probe is the extension's own command executor (`commandExists`), handed in
 * by the caller. One extra place is checked by file: the native installer's
 * default, `~/.local/bin/claude`. A VS Code launched from the Dock can hand the
 * extension a PATH without `~/.local/bin` while the user's terminal has it, and a
 * wrong "absent" here BLOCKS a working user — so this errs toward "present", which
 * is how things behaved before the check existed.
 *
 * Only a PRESENT answer is cached for the session. An absent one is asked again
 * next time, so a user who installs it after being told need not reload.
 *
 * This is the small fix only. The engine registry, Codex placeholders and the
 * install button the item designs wait on PR-1.
 *
 * @module features/ai/claudeCliAvailability
 */

import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The install page the AI-4a item names. */
export const CLAUDE_CODE_INSTALL_URL = 'https://claude.com/code';

/** The executor surface this needs — `CommandExecutor.commandExists`. */
export interface CommandProbe {
    commandExists(command: string): Promise<boolean>;
}

let installed = false;

/** Forget the cached answer. Tests, and nothing else, need this. */
export function resetClaudeCliCache(): void {
    installed = false;
}

/**
 * True when `claude` is on the PATH the extension sees, or at the native
 * installer's default location. Never throws.
 */
export async function isClaudeCliInstalled(
    probe: CommandProbe,
    fileExists: (p: string) => boolean = existsSync,
): Promise<boolean> {
    if (installed) return true;
    installed =
        (await askExecutor(probe)) ||
        fileExists(path.join(os.homedir(), '.local', 'bin', 'claude'));
    return installed;
}

/** The executor's answer; a failure of any kind — even reaching it — is "no". */
async function askExecutor(probe: CommandProbe): Promise<boolean> {
    try {
        return await probe.commandExists('claude');
    } catch {
        return false;
    }
}
