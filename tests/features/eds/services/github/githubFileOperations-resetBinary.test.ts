/**
 * resetRepoToTemplate keeps binary files and executable bits (2026-09-15).
 *
 * The archive was read with `toString('utf-8')` and every file sent as inline
 * tree `content` with mode `100644`. A favicon, font or image does not survive
 * that round trip, and a script lost its executable bit, so every Edge Delivery
 * reset (and the thin-layer pin at creation, which uses the same function)
 * wrote corrupted binaries into the SC's repository. The CitiSignal headless
 * source carries `src/app/favicon.ico` and an executable `.husky/pre-commit`,
 * and the stored modes were read off its real GitHub archive that day.
 *
 * The sibling suite stubs adm-zip; this one builds a REAL archive with bytes
 * that are not UTF-8 and a unix mode, because a stub hands back whatever the
 * test put in and cannot show what a decode does to it.
 */

import AdmZip from 'adm-zip';
import { GitHubFileOperations, mockRequest } from './githubFileOperations.testUtils';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

/** Bytes a UTF-8 decode cannot give back: a PNG signature (0x89, NULs) and a lone 0xFF. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0xfe]);

interface TreeEntry {
    path: string;
    mode: string;
    type: string;
    content?: string;
    sha?: string;
}

function archive(): Buffer {
    const zip = new AdmZip();
    zip.addFile('me-template-abc123/', Buffer.alloc(0));
    zip.addFile('me-template-abc123/public/favicon.png', PNG, '', 0o644);
    zip.addFile('me-template-abc123/.husky/pre-commit', Buffer.from('#!/bin/sh\nnpx lint-staged\n'), '', 0o755);
    zip.addFile('me-template-abc123/README.md', Buffer.from('# Demo\n'), '', 0o644);
    return zip.toBuffer();
}

function stubGitHub() {
    const trees: TreeEntry[] = [];
    const blobs: string[] = [];
    mockRequest.mockImplementation((route: string, options: Record<string, unknown>) => {
        if (route.includes('/branches/{branch}')) {
            return Promise.resolve({ data: { commit: { sha: 'head', commit: { tree: { sha: 't0' } } } } });
        }
        if (route.includes('/git/blobs')) {
            blobs.push(options.content as string);
            expect(options.encoding).toBe('base64');
            return Promise.resolve({ data: { sha: `blob-${blobs.length}` } });
        }
        if (route.includes('/git/trees')) {
            trees.push(...(options.tree as TreeEntry[]));
            return Promise.resolve({ data: { sha: 'tree-1' } });
        }
        if (route.includes('/git/commits')) return Promise.resolve({ data: { sha: 'commit-1' } });
        if (route.includes('/git/refs/heads/')) return Promise.resolve({ data: {} });
        return Promise.reject(new Error(`unexpected route ${route}`));
    });
    const bytes = archive();
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    }) as unknown as typeof fetch;
    return { trees, blobs };
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('resetRepoToTemplate — binary files and file modes', () => {
    it('CONTROL: the PNG bytes do not survive a UTF-8 decode, so inline content would corrupt them', () => {
        expect(Buffer.from(PNG.toString('utf-8'), 'utf-8').equals(PNG)).toBe(false);
    });

    it('uploads a binary file as a blob of its exact bytes and points the tree entry at it', async () => {
        const { trees, blobs } = stubGitHub();

        await new GitHubFileOperations(tokenService).resetRepoToTemplate('me', 'template', 'steve', 'site', new Map());

        const favicon = trees.find((entry) => entry.path === 'public/favicon.png');
        expect(favicon).toEqual({ path: 'public/favicon.png', mode: '100644', type: 'blob', sha: 'blob-1' });
        expect(blobs).toHaveLength(1);
        expect(Buffer.from(blobs[0], 'base64').equals(PNG)).toBe(true);
    });

    it('keeps an executable file executable, and sends text inline', async () => {
        const { trees } = stubGitHub();

        await new GitHubFileOperations(tokenService).resetRepoToTemplate('me', 'template', 'steve', 'site', new Map());

        expect(trees.find((entry) => entry.path === '.husky/pre-commit')).toEqual({
            path: '.husky/pre-commit',
            mode: '100755',
            type: 'blob',
            content: '#!/bin/sh\nnpx lint-staged\n',
        });
        expect(trees.find((entry) => entry.path === 'README.md')).toEqual({
            path: 'README.md',
            mode: '100644',
            type: 'blob',
            content: '# Demo\n',
        });
    });

    it('an override replaces a template file as text and keeps that file\'s mode', async () => {
        const { trees } = stubGitHub();

        await new GitHubFileOperations(tokenService).resetRepoToTemplate(
            'me',
            'template',
            'steve',
            'site',
            new Map([['.husky/pre-commit', '#!/bin/sh\necho demo\n']]),
        );

        expect(trees.find((entry) => entry.path === '.husky/pre-commit')).toEqual({
            path: '.husky/pre-commit',
            mode: '100755',
            type: 'blob',
            content: '#!/bin/sh\necho demo\n',
        });
    });
});
