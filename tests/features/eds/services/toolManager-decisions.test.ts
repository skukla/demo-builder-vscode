/**
 * ToolManager — the decisions, asserted on the ARGUMENTS the collaborators receive.
 *
 * Split from `toolManager.test.ts`, which pins the happy paths with
 * `stringContaining`/`objectContaining`. That style proves a call happened; it
 * cannot see a malformed one. A mutation run (PL-22, MUT-07) found 55 decisions in
 * this module that no test constrained — the force-reinstall guard, the clone
 * error taxonomy, the `.env` parser's skip rules, and the whole options object
 * handed to the shell executor. Everything here asserts an exact command string,
 * an exact options object, an exact thrown message, or the exact file content
 * written, because those are the only forms a wrong argument cannot pass through.
 */

// Mock fs/promises — arrow indirection keeps the jest.mock factory hoist-safe.
const mockFsAccess = jest.fn();
const mockFsMkdir = jest.fn();
const mockFsReadFile = jest.fn();
const mockFsWriteFile = jest.fn();
const mockFsRm = jest.fn();
jest.mock('fs/promises', () => ({
    access: (...args: unknown[]) => mockFsAccess(...args),
    mkdir: (...args: unknown[]) => mockFsMkdir(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
    rm: (...args: unknown[]) => mockFsRm(...args),
}));

const mockHomedir = jest.fn();
jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: () => mockHomedir(),
}));

// Semantic timeout categories, pinned so the exact-options assertions below can
// name the numbers the module actually passes through.
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { LONG: 180000, EXTENDED: 600000, NORMAL: 30000 },
}));

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { ToolManager } from '@/features/eds/services/toolManager';
import type { ACOConfig } from '@/features/eds/services/types';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import {
    commandResult,
    DATA_REPO_PATH,
    MOCK_HOME,
    TOOL_PATH,
    validAcoConfig,
} from './toolManager.testUtils';

const VALID_CONFIG = validAcoConfig();

describe('ToolManager decisions', () => {
    let toolManager: ToolManager;
    let executor: ReturnType<typeof createMockCommandExecutor>;

    /** Directory probes answer "missing" by default; `access` rejecting is the signal. */
    const toolIsMissing = () => mockFsAccess.mockRejectedValue(new Error('ENOENT'));
    const toolIsInstalled = () => mockFsAccess.mockResolvedValue(undefined);

    /**
     * The exact message of the rejection, not a substring and not the error object —
     * `toThrow(new Error(...))` compares `cause` too, and ToolManagerError always
     * carries one, so the object form can never match.
     */
    const rejectionMessage = async (run: Promise<unknown>): Promise<string> => {
        try {
            await run;
        } catch (error) {
            return (error as Error).message;
        }
        throw new Error('expected the call to reject, but it resolved');
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockHomedir.mockReturnValue(MOCK_HOME);
        toolIsMissing();
        mockFsMkdir.mockResolvedValue(undefined);
        mockFsWriteFile.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue('');
        mockFsRm.mockResolvedValue(undefined);

        executor = createMockCommandExecutor();
        executor.execute.mockResolvedValue(commandResult());

        const module = await import('@/features/eds/services/toolManager');
        toolManager = new module.ToolManager(executor as unknown as CommandExecutor);
    });

    // ==========================================================
    // The force-reinstall guard
    // ==========================================================
    describe('force reinstall', () => {
        it('leaves an installed tool on disk when force reinstall was not asked for', async () => {
            toolIsInstalled();

            await toolManager.ensureToolInstalled();

            expect(mockFsRm).not.toHaveBeenCalled();
        });

        it('removes the installed tool directory recursively and forcibly first', async () => {
            toolIsInstalled();

            await toolManager.ensureToolInstalled({ forceReinstall: true });

            expect(mockFsRm).toHaveBeenCalledWith(TOOL_PATH, { recursive: true, force: true });
        });
    });

    // ==========================================================
    // Clone: the arguments, and the error taxonomy
    // ==========================================================
    describe('cloning', () => {
        it('clones the data repository from the accs branch with the long timeout', async () => {
            await toolManager.ensureDataRepoInstalled();

            expect(executor.execute).toHaveBeenCalledWith(
                'git clone --depth 1 --branch accs ' +
                    `https://github.com/skukla/vertical-data-citisignal ${DATA_REPO_PATH}`,
                { timeout: 180000 },
            );
        });

        it('installs dependencies in the tool directory under Node 18', async () => {
            await toolManager.ensureToolInstalled();

            expect(executor.execute).toHaveBeenCalledWith('npm install --no-fund', {
                cwd: TOOL_PATH,
                timeout: 180000,
                useNodeVersion: '18',
            });
        });

        it('reports the git stderr verbatim when the clone exits non-zero', async () => {
            executor.execute.mockResolvedValue(
                commandResult({ code: 1, stderr: 'fatal: repository not found' }),
            );

            expect(await rejectionMessage(toolManager.ensureToolInstalled())).toBe(
                'Failed to clone tool: fatal: repository not found',
            );
        });

        it.each([
            ['timed out', 'Command timed out after 120000ms'],
            ['timeout', 'Clone timeout exceeded'],
        ])('labels a %s failure as a clone timeout', async (_wording, message) => {
            executor.execute.mockRejectedValue(new Error(message));

            expect(await rejectionMessage(toolManager.ensureToolInstalled())).toBe(
                `Clone timeout: ${message}`,
            );
        });

        it('wraps a clone failure that is not a timeout without the timeout wording', async () => {
            executor.execute.mockRejectedValue(new Error('Permission denied'));

            expect(await rejectionMessage(toolManager.ensureToolInstalled())).toBe(
                'Failed to clone tool: Permission denied',
            );
        });
    });

    // ==========================================================
    // Script execution: the whole options object
    // ==========================================================
    describe('executeToolScript', () => {
        beforeEach(() => toolIsInstalled());

        it('runs the plain script with streaming off when no options are given', async () => {
            await toolManager.executeAcoIngestion();

            expect(executor.execute).toHaveBeenCalledWith('npm run import:aco', {
                cwd: TOOL_PATH,
                timeout: 600000,
                useNodeVersion: '18',
                streaming: false,
                onOutput: undefined,
            });
        });

        it('prefixes DRY_RUN and appends the flag only when a dry run is asked for', async () => {
            await toolManager.executeAcoCleanup({ dryRun: true });

            expect(executor.execute).toHaveBeenCalledWith(
                'DRY_RUN=true npm run delete:aco --dry-run',
                expect.objectContaining({ cwd: TOOL_PATH }),
            );
        });
    });

    // ==========================================================
    // Credential validation
    // ==========================================================
    describe('validateAcoConfig', () => {
        const FIELDS: Array<[keyof ACOConfig, string]> = [
            ['apiUrl', 'Missing required ACO API URL'],
            ['apiKey', 'Missing required ACO API Key'],
            ['tenantId', 'Missing required ACO Tenant ID'],
            ['environmentId', 'Missing required ACO Environment ID'],
        ];

        it.each(FIELDS)('rejects an empty %s', async (field, message) => {
            toolIsInstalled();

            expect(
                await rejectionMessage(
                    toolManager.configureToolEnvironment({ ...VALID_CONFIG, [field]: '' }),
                ),
            ).toBe(message);
            expect(mockFsWriteFile).not.toHaveBeenCalled();
        });

        // Whitespace is the case the `!value` half of each guard cannot see: a
        // blank-but-present credential is present as far as truthiness goes, and only
        // the `.trim() === ''` half rejects it.
        it.each(FIELDS)('rejects a whitespace-only %s', async (field, message) => {
            toolIsInstalled();

            expect(
                await rejectionMessage(
                    toolManager.configureToolEnvironment({ ...VALID_CONFIG, [field]: '   ' }),
                ),
            ).toBe(message);
            expect(mockFsWriteFile).not.toHaveBeenCalled();
        });
    });

    // ==========================================================
    // .env generation: the exact bytes written
    // ==========================================================
    describe('configureToolEnvironment', () => {
        beforeEach(() => toolIsInstalled());

        it('writes the merged file exactly, preserving only real assignments', async () => {
            // Every line here is a decision the parser makes: a comment that looks
            // like an assignment, a blank line, leading indentation, a line with no
            // key, a line with no `=`, and a value that itself contains one.
            mockFsReadFile.mockResolvedValue(
                [
                    '# a plain comment',
                    '#DEBUG=old',
                    '',
                    '  CUSTOM_VAR=custom-value',
                    '=novalue',
                    'JUSTAKEY',
                    'TOKEN=a=b',
                ].join('\n'),
            );

            await toolManager.configureToolEnvironment({
                ...VALID_CONFIG,
                apiUrl: '  https://aco.example.com/api  ',
            });

            expect(mockFsWriteFile).toHaveBeenCalledWith(
                `${TOOL_PATH}/.env`,
                [
                    '# Commerce Demo Ingestion Tool Configuration',
                    '# Generated by Adobe Demo Builder',
                    '',
                    'CUSTOM_VAR=custom-value',
                    'TOKEN=a=b',
                    'DATA_REPO_PATH=../vertical-data-citisignal',
                    'ACO_API_URL=https://aco.example.com/api',
                    'ACO_API_KEY=test-api-key-12345',
                    'ACO_TENANT_ID=test-tenant-123',
                    'ACO_ENVIRONMENT_ID=test-env-456',
                    '',
                ].join('\n'),
                'utf-8',
            );
        });
    });

    // ==========================================================
    // Error extraction from stderr
    // ==========================================================
    describe('extractErrorMessage', () => {
        beforeEach(() => toolIsInstalled());

        const failWith = async (stderr: string) => {
            executor.execute.mockResolvedValue(commandResult({ code: 1, stderr, duration: 500 }));
            return toolManager.executeAcoIngestion();
        };

        it('prefers the Error: line over an earlier warning line', async () => {
            const result = await failWith('npm warn deprecated foo\nError:immediate failure');

            expect(result.error).toBe('Error:immediate failure');
        });

        it('captures a message that begins on the line after the Error: marker', async () => {
            const result = await failWith('Error:\nsecond line');

            expect(result.error).toBe('Error:\nsecond line');
        });

        it('falls back to the first non-blank line when there is no Error: marker', async () => {
            const result = await failWith('\n   npm ERR! code ERESOLVE\n');

            expect(result.error).toBe('npm ERR! code ERESOLVE');
        });
    });
});
