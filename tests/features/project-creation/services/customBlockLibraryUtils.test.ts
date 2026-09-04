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

        // Repeated and edge separators collapse rather than producing the double
        // spaces and leading space a raw split would leave in the picker label.
        it('should collapse repeated and leading separators into single spaces', () => {
            expect(deriveBlockLibraryName('-buildright--eds_')).toBe('Buildright Eds');
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

        // The match is owner AND repo. A different owner's repo of the same name is
        // a different library, and treating it as a duplicate would refuse to add it.
        it('should return false when the repo matches but the owner differs', () => {
            const source = { owner: 'someone-else', repo: 'buildright-eds', branch: 'main' };

            expect(isDuplicateCustomLibrary(source, existing)).toBe(false);
        });

        // ONE existing entry has to match, not all of them — the list normally holds
        // several libraries and the new one collides with at most one.
        it('should return true when only one of several existing entries matches', () => {
            const several: CustomBlockLibrary[] = [
                { name: 'Other', source: { owner: 'acme', repo: 'other-lib', branch: 'main' } },
                ...existing,
            ];
            const source = { owner: 'skukla', repo: 'buildright-eds', branch: 'main' };

            expect(isDuplicateCustomLibrary(source, several)).toBe(true);
        });

        it('should return false against an empty list', () => {
            const source = { owner: 'skukla', repo: 'buildright-eds', branch: 'main' };

            expect(isDuplicateCustomLibrary(source, [])).toBe(false);
        });
    });

    describe('parseCustomBlockLibrarySettings', () => {
        it('should parse URL strings with derived names', () => {
            const urls = [
                'https://github.com/acme/my-blocks',
                'https://github.com/acme/other-lib',
            ];

            const result = parseCustomBlockLibrarySettings(urls);

            expect(result).toEqual([
                { name: 'My Blocks', source: { owner: 'acme', repo: 'my-blocks', branch: 'main' } },
                { name: 'Other Lib', source: { owner: 'acme', repo: 'other-lib', branch: 'main' } },
            ]);
        });

        it('should silently filter out entries with invalid URLs', () => {
            const urls = [
                'https://github.com/acme/valid-repo',
                'https://gitlab.com/acme/not-github',
                'not-a-url',
            ];

            const result = parseCustomBlockLibrarySettings(urls);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Valid Repo');
        });

        it('should return empty array when settings is empty', () => {
            const result = parseCustomBlockLibrarySettings([]);

            expect(result).toEqual([]);
        });

        // The URL parser tolerates ordinary spaces itself, so plain padding proves
        // nothing about the trim. A non-breaking space is what a paste out of a doc
        // or a chat message actually carries, and `new URL` throws on it — without
        // the trim that settings entry disappears with no diagnostic.
        it('should trim whitespace from URLs, including a non-breaking space', () => {
            const urls = [
                '  https://github.com/acme/my-lib  ',
                '\u00a0https://github.com/acme/pasted-lib\u00a0',
            ];

            const result = parseCustomBlockLibrarySettings(urls);

            expect(result).toEqual([
                { name: 'My Lib', source: { owner: 'acme', repo: 'my-lib', branch: 'main' } },
                {
                    name: 'Pasted Lib',
                    source: { owner: 'acme', repo: 'pasted-lib', branch: 'main' },
                },
            ]);
        });
    });
});
