/**
 * Inspector Tagging — what it puts in the storefront's code.
 *
 * It vendors the SDK, writes `scripts/demo-inspector-init.js`, and keeps the SDK out of the
 * storefront's lint. Since 2026-10-29 it does NOT touch `scripts/delayed.js`: Adobe's B2B
 * template has no such file (removed 2026-07-30), so the old loader there never ran, and
 * the loader now sits in `head.html`, written by `bringStorefrontUpToDate`
 * (`storefrontCodeBlocks.ts`), which every install path runs after this.
 */

import { generateInspectorTreeEntries, installInspectorTagging } from '@/features/eds/services/inspectorHelpers';
import { createMockGithub } from '../../../helpers/githubFake';
import { createMockLogger } from '../../../helpers/loggerFake';

/** A repository with `files`, beside an SDK repository with one source file. */
function github(files: Record<string, string>) {
    return Object.assign(
        createMockGithub({
            getFileContent: jest.fn(async (_o: string, _r: string, path: string) =>
                (files[path] === undefined ? null : { content: files[path], sha: `${path}-sha`, path, encoding: 'utf-8' })),
        }),
        {
            listRepoFiles: jest.fn().mockResolvedValue([{ path: 'src/mesh.js', sha: 'blob-1' }]),
            getBlobContent: jest.fn().mockResolvedValue('export const x = 1;'),
            commitTreeToBranch: jest.fn().mockResolvedValue('commit'),
        },
    );
}

describe('generateInspectorTreeEntries', () => {
    it('vendors the SDK and writes the init script, and never reads or writes delayed.js', async () => {
        const gh = github({ 'scripts/delayed.js': '// add delayed functionality here\n', '.eslintignore': '' });

        const entries = await generateInspectorTreeEntries(gh, 'me', 'store', undefined, createMockLogger());

        expect(entries.map((e) => e.path)).toEqual([
            'scripts/demo-inspector-sdk/mesh.js',
            'scripts/demo-inspector-init.js',
            '.eslintignore',
        ]);
        expect(gh.getFileContent).not.toHaveBeenCalledWith('me', 'store', 'scripts/delayed.js');
    });

    it('works the same on a storefront with no delayed.js (the B2B template)', async () => {
        const gh = github({});

        const entries = await generateInspectorTreeEntries(gh, 'me', 'store', undefined, createMockLogger());

        expect(entries.map((e) => e.path)).toContain('scripts/demo-inspector-init.js');
    });
});

describe('installInspectorTagging', () => {
    it('commits the entries on their own, with nothing for delayed.js', async () => {
        const gh = github({ '.eslintignore': 'scripts/demo-inspector-sdk/\n' });

        expect(await installInspectorTagging(gh, 'me', 'store', undefined, createMockLogger())).toEqual({ success: true });

        const committed = (gh.commitTreeToBranch.mock.calls[0][3] as Array<{ path: string }>).map((e) => e.path);
        expect(committed).toEqual(['scripts/demo-inspector-sdk/mesh.js', 'scripts/demo-inspector-init.js']);
    });
});
