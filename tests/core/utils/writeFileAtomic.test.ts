/**
 * Unit tests for writeFileAtomic — the shared atomic file-write helper.
 *
 * Atomic pattern: write to a sibling .tmp file, then rename over the target
 * (rename is atomic on POSIX). Readers never see a partial write; a failure
 * cleans up the temp file and rethrows.
 */

import * as fs from 'fs/promises';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';

jest.mock('fs/promises', () => ({
    writeFile: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('writeFileAtomic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.rename.mockResolvedValue(undefined);
        mockFs.unlink.mockResolvedValue(undefined);
    });

    it('writes to a .tmp sibling then renames over the target', async () => {
        await writeFileAtomic('/proj/.demo-builder.json', '{"a":1}');

        expect(mockFs.writeFile).toHaveBeenCalledWith('/proj/.demo-builder.json.tmp', '{"a":1}');
        expect(mockFs.rename).toHaveBeenCalledWith(
            '/proj/.demo-builder.json.tmp',
            '/proj/.demo-builder.json',
        );

        // write must happen before rename
        const writeOrder = mockFs.writeFile.mock.invocationCallOrder[0];
        const renameOrder = mockFs.rename.mock.invocationCallOrder[0];
        expect(writeOrder).toBeLessThan(renameOrder);
    });

    it('does NOT rename when the temp write fails, and cleans up + rethrows', async () => {
        mockFs.writeFile.mockRejectedValueOnce(new Error('disk full'));

        await expect(writeFileAtomic('/proj/.env', 'X=1')).rejects.toThrow('disk full');

        expect(mockFs.rename).not.toHaveBeenCalled();
        expect(mockFs.unlink).toHaveBeenCalledWith('/proj/.env.tmp');
    });

    it('cleans up + rethrows when the rename fails', async () => {
        mockFs.rename.mockRejectedValueOnce(new Error('rename failed'));

        await expect(writeFileAtomic('/proj/.env', 'X=1')).rejects.toThrow('rename failed');

        expect(mockFs.unlink).toHaveBeenCalledWith('/proj/.env.tmp');
    });

    it('swallows cleanup errors (temp may not exist) and still rethrows the original', async () => {
        mockFs.writeFile.mockRejectedValueOnce(new Error('original failure'));
        mockFs.unlink.mockRejectedValueOnce(new Error('no temp file'));

        await expect(writeFileAtomic('/proj/.env', 'X=1')).rejects.toThrow('original failure');
    });
});
