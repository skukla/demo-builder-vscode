/**
 * VersionSatisfactionChecker — "is Node <family>.x installed?"
 *
 * WRITTEN 2026-08-28 as phase-2 of the ADR-015 convergence: no test existed,
 * and the module is on the conversion queue (it fetches the command executor).
 * The witness pins the seam the conversion moves — the exact command and
 * options — plus the two behaviours that matter to callers: the semver match
 * and the safe default.
 *
 * FIXTURE PROVENANCE: real `fnm list` output captured 2026-08-28.
 */

const mockExecute = jest.fn();
/**
 * CONVERTED 2026-08-28 (ADR-015): the executor is handed IN now, so this
 * suite mocks NO modules — the registry mock it used to need is gone and the
 * fake is a plain object. Assertions are unchanged.
 */
const executor = createMockCommandExecutor({ execute: mockExecute });

import { checkVersionSatisfaction } from '@/features/prerequisites/services/versioning/VersionSatisfactionChecker';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';

const FNM_LIST = ['* v18.20.8', '* v20.19.6 default', '* v22.21.1', '* v24.20.0', '* system'].join(
    '\n'
);

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('checkVersionSatisfaction', () => {
    it('consults the executor with the EXACT command and options (the conversion seam)', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_LIST });

        await checkVersionSatisfaction('20', executor, makeLogger());

        expect(mockExecute).toHaveBeenCalledWith('fnm list', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
        });
    });

    it('satisfied: names the installed version that matched the family', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_LIST });

        await expect(checkVersionSatisfaction('20', executor, makeLogger())).resolves.toEqual({
            satisfied: true,
            matchingVersion: '20.19.6',
        });
    });

    it('not satisfied: no installed version in that family', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_LIST });

        await expect(checkVersionSatisfaction('19', executor, makeLogger())).resolves.toEqual({
            satisfied: false,
            matchingVersion: undefined,
        });
    });

    it('REJECTS a non-numeric family without touching the executor (injection guard)', async () => {
        const logger = makeLogger();

        await expect(checkVersionSatisfaction('20 && curl evil', executor, logger)).resolves.toEqual({
            satisfied: false,
        });
        expect(mockExecute).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Invalid version family rejected')
        );
    });

    it('a failing executor answers the SAFE default (not satisfied), never throws', async () => {
        mockExecute.mockRejectedValue(new Error('fnm: command not found'));
        const logger = makeLogger();

        await expect(checkVersionSatisfaction('20', executor, logger)).resolves.toEqual({ satisfied: false });
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Error checking Node 20.x')
        );
    });
});
