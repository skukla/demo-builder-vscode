/**
 * Tests for fallbackMeshCheck helper function
 *
 * Tests fallback mesh detection using CLI output pattern matching.
 */

import { fallbackMeshCheck } from '@/features/mesh/services/meshCheckHelpers';
import { CommandExecutor } from '@/core/shell/commandExecutor';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

// Mock getMeshNodeVersion to return a consistent value
jest.mock('@/core/utils/meshConfig', () => ({
    getMeshNodeVersion: jest.fn(() => '20'),
}));

describe('fallbackMeshCheck', () => {
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;

    beforeEach(() => {
        mockCommandExecutor = createMockCommandExecutor();
    });

    const mockResult = (code: number, stdout: string | object, stderr: string = '') => ({
        code,
        stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
        stderr,
        duration: 0,
    });

    describe('detects API not enabled from output patterns', () => {
        it('should detect API not enabled from "unable to get mesh config" in stdout', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'Unable to get mesh config for this workspace')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith('aio api-mesh get --active', {
                useNodeVersion: '20',
            });
        });

        it('should detect API not enabled from "unable to get mesh config" in stderr', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'Error: Unable to get mesh config')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });

        it('should handle case-insensitive "unable to get" pattern', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'UNABLE TO GET MESH CONFIG')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result.apiEnabled).toBe(false);
        });
    });

    describe('detects API enabled but no mesh', () => {
        it('should detect "no mesh found" without "unable to get"', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'Error: No mesh found for this workspace')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: true,
                meshExists: false,
            });
        });

        it('should prioritize "unable to get" over "no mesh found" when both present', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, 'Unable to get mesh config. No mesh found.')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });
    });

    describe('detects existing mesh', () => {
        it('should extract meshId from stdout when mesh exists', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'Mesh ID: abc-123-def\nStatus: active')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: true,
                meshExists: true,
                meshId: 'abc-123-def',
                meshStatus: 'deployed',
            });
        });

        it('should handle mesh_id format with underscore', async () => {
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'mesh_id: xyz-789-abc'));

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result.meshId).toBe('xyz-789-abc');
        });

        it('should handle mesh-id format with hyphen separator', async () => {
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'mesh-id:123-456'));

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result.meshId).toBe('123-456');
        });

        // The separator between "mesh" and "id" is optional, and the space
        // before the colon is allowed. Both are spellings the CLI has printed,
        // and a missed match answers "mesh exists, id unknown" — which reads as
        // a mesh nothing can then be done to.
        it('should handle MeshID with no separator at all', async () => {
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'MeshID: abc-123'));

            expect((await fallbackMeshCheck(mockCommandExecutor)).meshId).toBe('abc-123');
        });

        it('should handle a space before the colon', async () => {
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID : abc-123'));

            expect((await fallbackMeshCheck(mockCommandExecutor)).meshId).toBe('abc-123');
        });

        it('should return mesh exists without meshId if pattern not found', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'Mesh is active and deployed')
            );

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: true,
                meshExists: true,
                meshId: undefined,
                meshStatus: 'deployed',
            });
        });
    });

    describe('handles command execution errors', () => {
        it('should detect permission denied (403) as API not enabled', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('403 Forbidden'));

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });

        it('should detect "forbidden" keyword as API not enabled', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Access forbidden'));

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result.apiEnabled).toBe(false);
        });

        it('should detect "not authorized" as API not enabled', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('User not authorized'));

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result.apiEnabled).toBe(false);
        });

        it('should handle "unable to get" in thrown error', async () => {
            const error = new Error('Unable to get mesh config');
            mockCommandExecutor.execute.mockRejectedValue(error);

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });

        it('should handle "no mesh found" in thrown error', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('No mesh found'));

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({
                apiEnabled: true,
                meshExists: false,
            });
        });

        // The thrown thing is not always an Error. `commandExecutor` rejects
        // with an object carrying the child process's own streams, and the
        // message can be empty — reading only `message` would drop the answer
        // and rethrow into the caller as an unknown failure.
        it('reads the pattern out of a rejection that carries only stderr', async () => {
            mockCommandExecutor.execute.mockRejectedValue({
                stderr: '403 Forbidden: mesh access denied',
            });

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({ apiEnabled: false, meshExists: false });
        });

        it('reads the pattern out of a rejection that carries only stdout', async () => {
            mockCommandExecutor.execute.mockRejectedValue({
                stdout: 'No mesh found for this workspace',
            });

            const result = await fallbackMeshCheck(mockCommandExecutor);

            expect(result).toEqual({ apiEnabled: true, meshExists: false });
        });

        it('should rethrow unknown errors', async () => {
            const unknownError = new Error('Network timeout');
            mockCommandExecutor.execute.mockRejectedValue(unknownError);

            await expect(fallbackMeshCheck(mockCommandExecutor)).rejects.toThrow('Network timeout');
        });
    });
});
