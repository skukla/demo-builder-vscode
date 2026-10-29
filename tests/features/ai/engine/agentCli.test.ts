/**
 * Is an agent's command-line tool installed? (AI-4a, generalized for AI-12.)
 *
 * The probe is the extension's own command executor (`commandExists`), plus the
 * usual install locations, because a VS Code launched from the Dock can lack them on
 * the PATH it hands the extension while the user's terminal has them. A wrong
 * "absent" would block a working user, so the location check errs toward "present".
 */

import * as os from 'os';
import * as path from 'path';
import { isAgentCliInstalled, resetAgentCliCache } from '@/features/ai/engine/agentCli';

const NATIVE_INSTALL = path.join(os.homedir(), '.local', 'bin', 'claude');

beforeEach(() => resetAgentCliCache());

describe('isAgentCliInstalled', () => {
    it('asks the command executor about the command by name', async () => {
        const commandExists = jest.fn().mockResolvedValue(true);

        await expect(isAgentCliInstalled('copilot', { commandExists }, () => false)).resolves.toBe(
            true,
        );
        expect(commandExists).toHaveBeenCalledWith('copilot');
    });

    it('remembers a PRESENT answer for the session, per command', async () => {
        const commandExists = jest.fn().mockResolvedValue(true);

        await isAgentCliInstalled('claude', { commandExists }, () => false);
        await isAgentCliInstalled('claude', { commandExists }, () => false);
        await isAgentCliInstalled('copilot', { commandExists }, () => false);

        expect(commandExists.mock.calls).toEqual([['claude'], ['copilot']]);
    });

    it('asks again after an ABSENT answer — the user may have just installed it', async () => {
        const commandExists = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        await expect(isAgentCliInstalled('claude', { commandExists }, () => false)).resolves.toBe(
            false,
        );
        await expect(isAgentCliInstalled('claude', { commandExists }, () => false)).resolves.toBe(
            true,
        );
        expect(commandExists).toHaveBeenCalledTimes(2);
    });

    it("finds the native installer's binary when the PATH the extension sees lacks it", async () => {
        const fileExists = jest.fn((p: string) => p === NATIVE_INSTALL);

        const found = await isAgentCliInstalled(
            'claude',
            { commandExists: jest.fn().mockResolvedValue(false) },
            fileExists,
        );

        expect(found).toBe(true);
        expect(fileExists).toHaveBeenCalledWith(NATIVE_INSTALL);
    });

    it("finds Homebrew's binary when the PATH the extension sees lacks /opt/homebrew/bin", async () => {
        const fileExists = jest.fn((p: string) => p === '/opt/homebrew/bin/copilot');

        const found = await isAgentCliInstalled(
            'copilot',
            { commandExists: jest.fn().mockResolvedValue(false) },
            fileExists,
        );

        expect(found).toBe(true);
    });

    it('answers absent, not a throw, when the probe itself fails', async () => {
        const commandExists = jest.fn().mockRejectedValue(new Error('spawn failed'));

        await expect(isAgentCliInstalled('claude', { commandExists }, () => false)).resolves.toBe(
            false,
        );
    });

    it('answers absent when the executor cannot even be reached (a synchronous throw)', async () => {
        const commandExists = jest.fn(() => {
            throw new Error('CommandExecutor not registered');
        });

        await expect(isAgentCliInstalled('claude', { commandExists }, () => false)).resolves.toBe(
            false,
        );
    });
});
