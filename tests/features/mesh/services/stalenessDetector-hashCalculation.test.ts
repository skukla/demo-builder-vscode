// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
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
    /**
     * WHAT the hash is taken OVER, asserted on the argument `update` receives.
     *
     * Every earlier test here reads the DIGEST, which is a mocked constant — it
     * says the same 'abc123' whatever content went in, so dropping a directory,
     * dropping the extension filter, dropping the sort or concatenating in the
     * wrong order all leave it green. The one observable that moves is the
     * string handed to `update`, so that is what these assert.
     */
    describe('the content the hash is taken over', () => {
        const MESH_PATH = '/path/to/mesh';
        const CONTENT: Record<string, string> = {
            '/path/to/mesh/mesh.config.js': 'CFG;',
            '/path/to/mesh/build/resolvers/a.js': 'RESOLVER-A;',
            '/path/to/mesh/build/resolvers/b.js': 'RESOLVER-B;',
            '/path/to/mesh/build/resolvers/notes.txt': 'NOT-A-RESOLVER;',
            '/path/to/mesh/schema/x.graphql': 'SCHEMA-X;',
            '/path/to/mesh/schema/y.graphql': 'SCHEMA-Y;',
            '/path/to/mesh/schema/README.md': 'NOT-A-SCHEMA;',
        };

        function arrangeTree() {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;

            (mockFs.readFile as jest.Mock).mockImplementation((filePath: string) =>
                filePath in CONTENT
                    ? Promise.resolve(CONTENT[filePath])
                    : Promise.reject(new Error(`ENOENT: ${filePath}`))
            );
            (mockFs.readdir as jest.Mock)
                .mockResolvedValueOnce(['b.js', 'a.js', 'notes.txt'] as string[])
                .mockResolvedValueOnce(['y.graphql', 'README.md', 'x.graphql'] as string[]);

            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);
            return { mockFs, mockCrypto, mockHash };
        }

        it('hashes config, then sorted resolvers, then sorted schemas — in that order', async () => {
            const { mockHash } = arrangeTree();

            const result = await calculateMeshSourceHash(MESH_PATH);

            expect(result).toBe('abc123');
            expect(mockHash.update).toHaveBeenCalledWith(
                'CFG;RESOLVER-A;RESOLVER-B;SCHEMA-X;SCHEMA-Y;'
            );
        });

        it('reads each source file from the directory it belongs to, as utf-8', async () => {
            const { mockFs } = arrangeTree();

            await calculateMeshSourceHash(MESH_PATH);

            expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/mesh/mesh.config.js', 'utf-8');
            expect(mockFs.readFile).toHaveBeenCalledWith(
                '/path/to/mesh/build/resolvers/a.js',
                'utf-8'
            );
            expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/mesh/schema/x.graphql', 'utf-8');
        });

        it('never reads a file whose extension is not a resolver or a schema', async () => {
            const { mockFs } = arrangeTree();

            await calculateMeshSourceHash(MESH_PATH);

            const readPaths = (mockFs.readFile as jest.Mock).mock.calls.map((c) => c[0]);
            expect(readPaths).not.toContain('/path/to/mesh/build/resolvers/notes.txt');
            expect(readPaths).not.toContain('/path/to/mesh/schema/README.md');
        });

        it('digests the combined content as md5 hex', async () => {
            const { mockCrypto, mockHash } = arrangeTree();

            await calculateMeshSourceHash(MESH_PATH);

            expect(mockCrypto.createHash).toHaveBeenCalledWith('md5');
            expect(mockHash.digest).toHaveBeenCalledWith('hex');
        });

        it('returns null when the digest itself fails', async () => {
            arrangeTree();
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;
            (mockCrypto.createHash as jest.Mock).mockImplementation(() => {
                throw new Error('unsupported digest');
            });

            const result = await calculateMeshSourceHash(MESH_PATH);

            expect(result).toBeNull();
        });

        it('returns null when nothing on disk contributes any content', async () => {
            const mockFs = fs as jest.Mocked<typeof fs>;
            const mockCrypto = crypto as jest.Mocked<typeof crypto>;
            (mockFs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
            (mockFs.readdir as jest.Mock).mockResolvedValue([]);
            const mockHash = {
                update: jest.fn().mockReturnThis(),
                digest: jest.fn().mockReturnValue('abc123'),
            };
            (mockCrypto.createHash as jest.Mock).mockReturnValue(mockHash);

            const result = await calculateMeshSourceHash('/path/to/mesh');

            expect(result).toBeNull();
            expect(mockCrypto.createHash).not.toHaveBeenCalled();
        });
    });
});
