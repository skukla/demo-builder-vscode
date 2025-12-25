// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
}));

import { calculateMeshSourceHash } from '@/features/mesh/services/stalenessDetector';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

/**
 * StalenessDetector - Hash Calculation Tests
 *
 * Tests mesh source file hash calculation:
 * - Calculate hash from mesh config and source files
 * - Handle missing files and directories
 * - Sort files for consistent hashing
 * - Hash all relevant source files (config, resolvers, schemas)
 *
 * Total tests: 4
 */

describe('StalenessDetector - Hash Calculation', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Re-setup mock implementations (jest.clearAllMocks removes implementations)
        const mockFs = fs as jest.Mocked<typeof fs>;
        (mockFs.readFile as jest.Mock).mockReset();
        (mockFs.readdir as jest.Mock).mockReset();

        const mockCrypto = crypto as jest.Mocked<typeof crypto>;
        (mockCrypto.createHash as jest.Mock).mockReset();
    });

    describe('calculateMeshSourceHash', () => {
        it('should calculate hash from mesh config and source files', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            // Mock mesh.config.js read
            (mockFs.readFile as jest.Mock)
                .mockResolvedValueOnce('mesh config content')  // mesh.config.js
                .mockResolvedValueOnce('resolver1')            // resolver.js
                .mockResolvedValueOnce('schema1');             // schema.graphql

            // Mock directory listings
            (mockFs.readdir as jest.Mock)
                .mockResolvedValueOnce(['resolver.js'] as string[])      // build/resolvers/
                .mockResolvedValueOnce(['schema.graphql'] as string[]);  // schema/

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBe('abc123');
            expect(mockHash.update).toHaveBeenCalled();
        });

        it('should handle missing mesh config file', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));
            (mockFs.readdir as jest.Mock).mockResolvedValue([]);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue(null),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBeNull();
        });

        it('should handle missing resolver directory', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            // Mock mesh.config.js read succeeds
            (mockFs.readFile as jest.Mock).mockResolvedValue('mesh config');

            // Mock resolvers directory missing, schemas directory empty
            (mockFs.readdir as jest.Mock)
                .mockRejectedValueOnce(new Error('ENOENT'))  // build/resolvers/ missing
                .mockResolvedValueOnce([]);                  // schema/ empty

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBe('abc123');
        });

        it('should sort files for consistent hashing', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            // Mock all readFile calls (mesh.config.js + sorted resolvers)
            (mockFs.readFile as jest.Mock).mockResolvedValue('content');

            // Mock directory listings with unsorted files
            (mockFs.readdir as jest.Mock)
                .mockResolvedValueOnce(['c.js', 'a.js', 'b.js'] as string[])      // build/resolvers/
                .mockResolvedValueOnce(['y.graphql', 'x.graphql'] as string[]);   // schema/

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

            await calculateMeshSourceHash('/path/to/mesh');

            // Verify files were sorted before reading
            // readFileCalls[0] = mesh.config.js
            // readFileCalls[1-3] = sorted resolver files (a, b, c)
            const readFileCalls = mockFs.readFile.mock.calls;
            expect(readFileCalls[1][0]).toContain('a.js');
            expect(readFileCalls[2][0]).toContain('b.js');
            expect(readFileCalls[3][0]).toContain('c.js');
        });
    });
});
