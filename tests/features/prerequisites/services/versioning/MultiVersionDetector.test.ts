/**
 * MultiVersionDetector — the Node-version reads behind the prerequisites UI.
 *
 * WRITTEN 2026-08-28 as phase-2 of the ADR-015 convergence: this module had
 * NO test at all, and it is on the conversion queue (it fetches the command
 * executor from ServiceLocator three times). A conversion with no test is a
 * conversion nobody can vouch for, so the witness comes first — and what it
 * witnesses is the SEAM the conversion will move: the exact command, the exact
 * options, and the executor being consulted at all.
 *
 * FIXTURE PROVENANCE: `FNM_LIST` is real `fnm list` output captured from a
 * developer machine on 2026-08-28, not composed from memory (ADR-016's
 * contract tier). It deliberately includes the `system` line and a `default`
 * suffix — the two shapes an invented fixture would omit.
 */

const mockExecute = jest.fn();
/**
 * CONVERTED 2026-08-28 (ADR-015): the executor is handed IN now, so this
 * suite mocks NO modules — the registry mock it used to need is gone and the
 * fake is a plain object. Assertions are unchanged.
 */
const executor = { execute: mockExecute } as never;

import {
    checkMultipleNodeVersions,
    getInstalledNodeVersions,
    getLatestInFamily,
} from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import type { Logger } from '@/types/logger';

/** Real `fnm list` output, captured 2026-08-28. */
const FNM_LIST = [
    '* v18.20.8',
    '* v20.19.6 default',
    '* v22.21.1',
    '* v24.12.0',
    '* v24.20.0',
    '* system',
].join('\n');

/** Real `fnm list-remote` shape: newest last in fnm's own ordering. */
const FNM_REMOTE = ['v20.19.4', 'v20.19.5', 'v20.19.6', 'v22.21.1'].join('\n');

function makeLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('checkMultipleNodeVersions', () => {
    it('consults the executor with the EXACT command and options (the conversion seam)', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_LIST });

        await checkMultipleNodeVersions({ '20': 'API Mesh' }, executor, makeLogger());

        expect(mockExecute).toHaveBeenCalledTimes(1);
        expect(mockExecute).toHaveBeenCalledWith('fnm list', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
        });
    });

    it('reports an installed family with its FULL version, and a missing one as not installed', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_LIST });

        const results = await checkMultipleNodeVersions(
            { '20': 'API Mesh', '21': 'Nothing' },
            executor,
            makeLogger()
        );

        expect(results).toEqual([
            { version: 'Node 20.19.6', component: 'API Mesh', installed: true },
            { version: 'Node 21', component: 'Nothing', installed: false },
        ]);
    });

    it('a failing executor degrades to all-not-installed and warns — never throws', async () => {
        mockExecute.mockRejectedValue(new Error('fnm: command not found'));
        const logger = makeLogger();

        const results = await checkMultipleNodeVersions({ '20': 'API Mesh' }, executor, logger);

        expect(results).toEqual([{ version: 'Node 20', component: 'API Mesh', installed: false }]);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not check installed Node versions')
        );
    });
});

describe('getInstalledNodeVersions', () => {
    it('returns the installed major versions, sorted, from real fnm output', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_LIST });

        await expect(getInstalledNodeVersions(executor, makeLogger())).resolves.toEqual([
            '18',
            '20',
            '22',
            '24',
        ]);
        expect(mockExecute).toHaveBeenCalledWith('fnm list', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
        });
    });

    it('answers an empty list when the executor fails', async () => {
        mockExecute.mockRejectedValue(new Error('boom'));
        const logger = makeLogger();

        await expect(getInstalledNodeVersions(executor, logger)).resolves.toEqual([]);
        expect(logger.warn).toHaveBeenCalled();
    });
});

describe('getLatestInFamily', () => {
    it('REJECTS a non-numeric family without touching the executor (injection guard)', async () => {
        const logger = makeLogger();

        await expect(getLatestInFamily('20; rm -rf /', executor, logger)).resolves.toBeNull();

        // The guard's whole point: no command is built at all.
        expect(mockExecute).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Invalid version family rejected')
        );
    });

    it('returns the first matching version in the family, without the v prefix', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_REMOTE });

        await expect(getLatestInFamily('20', executor, makeLogger())).resolves.toBe('20.19.4');
        expect(mockExecute).toHaveBeenCalledWith('fnm list-remote', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
        });
    });

    it('answers null when the family has no remote versions', async () => {
        mockExecute.mockResolvedValue({ stdout: FNM_REMOTE });

        await expect(getLatestInFamily('19', executor, makeLogger())).resolves.toBeNull();
    });
});
