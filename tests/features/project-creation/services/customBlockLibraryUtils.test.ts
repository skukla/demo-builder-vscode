/**
 * Custom Block Library Utils Tests
 *
 * Tests for parsing GitHub URLs into block library sources,
 * deriving display names from repo names, and detecting
 * duplicate custom libraries.
 */

import {
    parseCustomBlockLibraryUrl,
    deriveBlockLibraryName,
    isDuplicateCustomLibrary,
    parseCustomBlockLibrarySettings,
} from '@/features/project-creation/services/customBlockLibraryUtils';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

describe('customBlockLibraryUtils', () => {
    describe('parseCustomBlockLibraryUrl', () => {
        it('should return AddonSource for valid GitHub URL', () => {
            const result = parseCustomBlockLibraryUrl(
                'https://github.com/skukla/buildright-eds',
            );

            expect(result).toEqual({
                owner: 'skukla',
                repo: 'buildright-eds',
                branch: 'main',
            });
        });

        it('should return null for non-GitHub URL', () => {
            const result = parseCustomBlockLibraryUrl(
                'https://gitlab.com/owner/repo',
            );

            expect(result).toBeNull();
        });

        it('should return null for empty string', () => {
            const result = parseCustomBlockLibraryUrl('');

            expect(result).toBeNull();
        });

        it('should strip .git suffix from repo name', () => {
            const result = parseCustomBlockLibraryUrl(
                'https://github.com/owner/repo.git',
            );

            expect(result).toEqual({
                owner: 'owner',
                repo: 'repo',
                branch: 'main',
            });
        });

        it('should return null for malformed URL', () => {
            const result = parseCustomBlockLibraryUrl('not-a-url');

            expect(result).toBeNull();
        });
    });

    describe('deriveBlockLibraryName', () => {
        it('should convert hyphenated names to title case', () => {
            expect(deriveBlockLibraryName('buildright-eds')).toBe(
                'Buildright Eds',
            );
        });

        it('should convert underscored names to title case', () => {
            expect(deriveBlockLibraryName('my_block_lib')).toBe(
                'My Block Lib',
            );
        });

        it('should handle single-word names', () => {
            expect(deriveBlockLibraryName('isle5')).toBe('Isle5');
        });
    });

    describe('isDuplicateCustomLibrary', () => {
        const existing: CustomBlockLibrary[] = [
            {
                name: 'BuildRight EDS',
                source: { owner: 'skukla', repo: 'buildright-eds', branch: 'main' },
            },
        ];

        it('should return true when source owner+repo matches existing entry', () => {
            const source = { owner: 'skukla', repo: 'buildright-eds', branch: 'main' };

            expect(isDuplicateCustomLibrary(source, existing)).toBe(true);
        });

        it('should return false when repo differs', () => {
            const source = { owner: 'skukla', repo: 'other-repo', branch: 'main' };

            expect(isDuplicateCustomLibrary(source, existing)).toBe(false);
        });
    });

    describe('parseCustomBlockLibrarySettings', () => {
        it('should parse valid URLs from settings into CustomBlockLibrary[]', () => {
            const settings = [
                { name: 'My Blocks', url: 'https://github.com/acme/my-blocks' },
                { name: 'Other Lib', url: 'https://github.com/acme/other-lib' },
            ];

            const result = parseCustomBlockLibrarySettings(settings);

            expect(result).toEqual([
                { name: 'My Blocks', source: { owner: 'acme', repo: 'my-blocks', branch: 'main' } },
                { name: 'Other Lib', source: { owner: 'acme', repo: 'other-lib', branch: 'main' } },
            ]);
        });

        it('should silently filter out entries with invalid URLs', () => {
            const settings = [
                { name: 'Valid', url: 'https://github.com/acme/valid-repo' },
                { name: 'Invalid', url: 'https://gitlab.com/acme/not-github' },
                { name: 'Broken', url: 'not-a-url' },
            ];

            const result = parseCustomBlockLibrarySettings(settings);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Valid');
        });

        it('should return empty array when settings is empty', () => {
            const result = parseCustomBlockLibrarySettings([]);

            expect(result).toEqual([]);
        });
    });
});
