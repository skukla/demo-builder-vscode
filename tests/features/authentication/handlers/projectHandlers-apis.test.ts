/**
 * Project Handlers - API Tests
 *
 * Tests for project API verification:
 * - handleCheckProjectApis: Verify API Mesh access
 * - Plugin detection
 * - Fallback command strategies
 */

import { handleCheckProjectApis } from '@/features/authentication/handlers/projectHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { parseJSON } from '@/types/typeGuards';
import { createMockContext, createMockCommandExecutor } from './projectHandlers.testUtils';

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/validators/AdobeResourceValidator');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
    parseJSON: jest.fn((str: string) => JSON.parse(str))
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000 // Standard API calls (replaces PROJECT_LIST, WORKSPACE_LIST)
    }
}));
jest.mock('@/core/utils/promiseUtils', () => ({
    withTimeout: jest.fn((promise) => promise)
}));

describe('projectHandlers - API Verification', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockCommandExecutor: ReturnType<typeof createMockCommandExecutor>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        mockCommandExecutor = createMockCommandExecutor();

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);
    });

    /** A successful CLI result carrying `stdout`. */
    const ok = (stdout: string) => ({ stdout, stderr: '', code: 0, duration: 0 });
    /** The commands run, in order — the decision trail the handler leaves. */
    const commandsRun = () => mockCommandExecutor.execute.mock.calls.map((c) => c[0]);

    describe('handleCheckProjectApis', () => {
        it('should detect API Mesh when enabled', async () => {
            // Mock CLI commands
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' }),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockResolvedValueOnce({
                    // aio api-mesh:get --active --json
                    stdout: JSON.stringify({ meshId: 'mesh-123' }),
                    stderr: '',
                    code: 0,
                    duration: 0,
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh access confirmed')
            );
        });

        it('should detect when API Mesh is not enabled', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' }),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json
                    message: 'Error: 403 Forbidden',
                    stderr: 'not authorized',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh not enabled')
            );
        });

        it('should handle when plugin is not installed', async () => {
            mockCommandExecutor.execute.mockResolvedValueOnce({
                // aio plugins --json
                stdout: JSON.stringify([
                    { name: '@adobe/aio-cli-plugin-something-else' }
                ]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh CLI plugin not installed')
            );
        });

        it('should handle no active mesh but API enabled', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' }),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json
                    message: 'Error: No active mesh found',
                    stderr: 'not found',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh enabled; no active mesh found')
            );
        });

        it('should try fallback commands on error', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' }),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json fails
                    message: 'Unknown command',
                    stderr: '',
                    stdout: ''
                })
                .mockResolvedValueOnce({
                    // aio api-mesh:get --help succeeds
                    stdout: 'Usage: aio api-mesh:get',
                    stderr: '',
                    code: 0,
                    duration: 0,
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
        });

        it('should return false when all probes fail', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' }),
                    stderr: '',
                    code: 0,
                    duration: 0,
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --help fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                })
                .mockRejectedValueOnce({
                    // aio api-mesh --help fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] Unable to confirm API Mesh access')
            );
        });

        it('should handle plugin list parsing errors', async () => {
            mockCommandExecutor.execute.mockResolvedValueOnce({
                // aio plugins --json with invalid JSON
                stdout: 'invalid json',
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
        });

        it('runs the CLI probes under the mesh node version', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(ok(JSON.stringify([{ name: '@adobe/aio-cli-plugin-api-mesh' }])))
                .mockResolvedValueOnce(ok('{}'))
                .mockResolvedValueOnce(ok('{}'));

            await handleCheckProjectApis(mockContext);

            const options = { useNodeVersion: getMeshNodeVersion() };
            expect(mockCommandExecutor.execute.mock.calls).toEqual([
                ['aio plugins --json', options],
                ['aio console projects get --json', options],
                ['aio api-mesh:get --active --json', options],
            ]);
        });

        it('an unparseable plugin list answers no mesh and probes nothing further', async () => {
            mockCommandExecutor.execute.mockResolvedValueOnce(ok('not json'));
            (parseJSON as jest.Mock).mockReturnValueOnce(null);

            const result = await handleCheckProjectApis(mockContext);

            expect(result).toEqual({ success: true, data: { hasMesh: false } });
            expect(commandsRun()).toEqual(['aio plugins --json']);
        });

        it('finds the mesh plugin wherever it sits in the list, not only first', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(
                    ok(JSON.stringify([{ name: '@adobe/aio-cli-plugin-app' }, { id: '@adobe/aio-cli-plugin-api-mesh' }]))
                )
                .mockResolvedValueOnce(ok('{}'))
                .mockResolvedValueOnce(ok('{}'));

            const result = await handleCheckProjectApis(mockContext);

            expect(result.data).toEqual({ hasMesh: true });
        });

        describe('the active-mesh probe reads a refusal from ANY stream of the failure', () => {
            it.each([
                ['message', { message: '403 Forbidden' }],
                ['stderr', { stderr: 'API Mesh is not enabled for this project' }],
                ['stdout', { stdout: 'no access to mesh' }],
            ])('a refusal in %s settles on no mesh without the fallback probes', async (_stream, failure) => {
                mockCommandExecutor.execute
                    .mockResolvedValueOnce(ok(JSON.stringify([{ name: '@adobe/aio-cli-plugin-api-mesh' }])))
                    .mockResolvedValueOnce(ok('{}'))
                    .mockRejectedValueOnce(failure);

                const result = await handleCheckProjectApis(mockContext);

                expect(result).toEqual({ success: true, data: { hasMesh: false } });
                expect(commandsRun()).toEqual([
                    'aio plugins --json',
                    'aio console projects get --json',
                    'aio api-mesh:get --active --json',
                ]);
            });
        });

        describe('the fallback probes read a refusal from ANY stream of the failure', () => {
            it.each([
                ['message', { message: 'missing permission: mesh' }],
                ['stderr', { stderr: 'not authorized' }],
                ['stdout', { stdout: 'forbidden' }],
            ])('a refusal in %s settles on no mesh and stops probing', async (_stream, failure) => {
                mockCommandExecutor.execute
                    .mockResolvedValueOnce(ok(JSON.stringify([{ name: '@adobe/aio-cli-plugin-api-mesh' }])))
                    .mockResolvedValueOnce(ok('{}'))
                    .mockRejectedValueOnce({ message: 'Unknown' })
                    .mockRejectedValueOnce(failure)
                    .mockResolvedValueOnce(ok('Usage: aio api-mesh'));

                const result = await handleCheckProjectApis(mockContext);

                expect(result).toEqual({ success: true, data: { hasMesh: false } });
                expect(commandsRun()).toEqual([
                    'aio plugins --json',
                    'aio console projects get --json',
                    'aio api-mesh:get --active --json',
                    'aio api-mesh:get --help',
                ]);
            });
        });

        it('a missing command executor is an error the caller sees, not a quiet no-mesh', async () => {
            (ServiceLocator.getCommandExecutor as jest.Mock).mockImplementation(() => {
                throw new Error('No command executor registered');
            });

            await expect(handleCheckProjectApis(mockContext)).rejects.toThrow(
                'No command executor registered'
            );
        });

        it('should handle general errors', async () => {
            const error = new Error('CLI command failed');
            mockCommandExecutor.execute.mockRejectedValue(error);

            // Implementation catches errors and returns success with hasMesh: false
            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.debugLogger.debug).toHaveBeenCalledWith(
                '[Adobe Setup] Failed to verify plugins; continuing',
                expect.objectContaining({ error: expect.any(String) })
            );
        });
    });
});
