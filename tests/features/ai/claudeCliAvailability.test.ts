/**
 * Is Claude Code (the command-line tool) installed? (AI-4a, the small fix.)
 *
 * The probe is the extension's own command executor (`commandExists`), plus the
 * native installer's default location, because a VS Code launched from the Dock can
 * lack `~/.local/bin` on the PATH it hands the extension while the user's terminal
 * has it. A wrong "absent" would block a working user, so the location check errs
 * toward "present" — the behaviour before this fix.
 */

import * as os from 'os';
import * as path from 'path';
import {
    CLAUDE_CODE_INSTALL_URL,
    isClaudeCliInstalled,
    resetClaudeCliCache,
} from '@/features/ai/claudeCliAvailability';

const NATIVE_INSTALL = path.join(os.homedir(), '.local', 'bin', 'claude');

beforeEach(() => resetClaudeCliCache());

describe('isClaudeCliInstalled', () => {
    it('asks the command executor about `claude` by name', async () => {
        const commandExists = jest.fn().mockResolvedValue(true);

        await expect(isClaudeCliInstalled({ commandExists }, () => false)).resolves.toBe(true);
        expect(commandExists).toHaveBeenCalledWith('claude');
    });

    it('remembers a PRESENT answer for the session', async () => {
        const commandExists = jest.fn().mockResolvedValue(true);

        await isClaudeCliInstalled({ commandExists }, () => false);
        await isClaudeCliInstalled({ commandExists }, () => false);

        expect(commandExists).toHaveBeenCalledTimes(1);
    });

    it('asks again after an ABSENT answer — the user may have just installed it', async () => {
        const commandExists = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        await expect(isClaudeCliInstalled({ commandExists }, () => false)).resolves.toBe(false);
        await expect(isClaudeCliInstalled({ commandExists }, () => false)).resolves.toBe(true);
        expect(commandExists).toHaveBeenCalledTimes(2);
    });

    it("finds the native installer's binary when the PATH the extension sees lacks it", async () => {
        const fileExists = jest.fn((p: string) => p === NATIVE_INSTALL);

        const found = await isClaudeCliInstalled(
            { commandExists: jest.fn().mockResolvedValue(false) },
            fileExists,
        );

        expect(found).toBe(true);
        expect(fileExists).toHaveBeenCalledWith(NATIVE_INSTALL);
    });

    it('answers absent, not a throw, when the probe itself fails', async () => {
        const commandExists = jest.fn().mockRejectedValue(new Error('spawn failed'));

        await expect(isClaudeCliInstalled({ commandExists }, () => false)).resolves.toBe(false);
    });

    it('answers absent when the executor cannot even be reached (a synchronous throw)', async () => {
        const commandExists = jest.fn(() => {
            throw new Error('CommandExecutor not registered');
        });

        await expect(isClaudeCliInstalled({ commandExists }, () => false)).resolves.toBe(false);
    });

    it('points at the install page the backlog item names', () => {
        expect(CLAUDE_CODE_INSTALL_URL).toBe('https://claude.com/code');
    });
});
