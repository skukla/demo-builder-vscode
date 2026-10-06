/**
 * Is an agent's command-line tool installed? (AI-4a, generalized for AI-12.)
 *
 * Asked by two places that used to assume it: the Chat launch, which typed
 * `claude …` into a terminal and left a user without it at `command not found`,
 * and the dashboard's "AI Ready" badge, which stayed green for the same user.
 *
 * The probe is the extension's own command executor (`commandExists`), handed in
 * by the caller. A few install locations are also checked by file: a VS Code
 * launched from the Dock can hand the extension a PATH without them while the
 * user's terminal has them, and a wrong "absent" BLOCKS a working user — so this
 * errs toward "present", which is how things behaved before the check existed.
 *
 * Only a PRESENT answer is cached for the session. An absent one is asked again
 * next time, so a user who installs it after being told need not reload.
 *
 * @module features/ai/engine/agentCli
 */

import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The executor surface this needs — `CommandExecutor.commandExists`. */
export interface CommandProbe {
    commandExists(command: string): Promise<boolean>;
}

/**
 * Where installers put a CLI that a Dock-launched VS Code may not have on its PATH:
 * the native installer's `~/.local/bin`, and Homebrew on Apple silicon and Intel.
 */
function fallbackLocations(command: string): string[] {
    return [
        path.join(os.homedir(), '.local', 'bin', command),
        path.join('/opt/homebrew/bin', command),
        path.join('/usr/local/bin', command),
    ];
}

const present = new Set<string>();

/** Forget the cached answers. Tests, and nothing else, need this. */
export function resetAgentCliCache(): void {
    present.clear();
}

/**
 * True when `command` is on the PATH the extension sees, or at a known install
 * location. Never throws.
 */
export async function isAgentCliInstalled(
    command: string,
    probe: CommandProbe,
    fileExists: (p: string) => boolean = existsSync,
): Promise<boolean> {
    if (present.has(command)) return true;
    const found =
        (await askExecutor(command, probe)) || fallbackLocations(command).some((p) => fileExists(p));
    if (found) present.add(command);
    return found;
}

/** The executor's answer; a failure of any kind — even reaching it — is "no". */
async function askExecutor(command: string, probe: CommandProbe): Promise<boolean> {
    try {
        return await probe.commandExists(command);
    } catch {
        return false;
    }
}
