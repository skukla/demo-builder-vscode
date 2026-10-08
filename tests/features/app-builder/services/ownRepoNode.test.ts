/**
 * Reading an SC's own repo for the Node it needs (PR-1a step 8): the repo reader's
 * two routes, and the resolver composed from it and the executor.
 */

import { githubRepoTextReader, ownRepoNodeResolver } from '@/features/app-builder/services/ownRepoNode';
import type { CommandResult } from '@/core/shell/types';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';

const logger = { debug: jest.fn() };
const SOURCE = { owner: 'acme', repo: 'erp-bridge', branch: 'main' };

const ran = (stdout: string): CommandResult => ({ stdout, stderr: '', code: 0, duration: 1 });

/** An executor answering `fnm list` and `fnm list-remote` with what it is given. */
function executorAnswering(list: string, remote: string | Error) {
    return {
        execute: jest.fn(async (command: string): Promise<CommandResult> => {
            if (command !== 'fnm list-remote') return ran(list);
            if (remote instanceof Error) throw remote;
            return ran(remote);
        }),
    };
}

const REMOTE = 'v22.23.3 (Jod)\nv24.21.0 (Krypton)\nv26.11.0\n';

describe('ownRepoNodeResolver', () => {
    it('answers Demo Builder\'s Node for a repo with no range, without asking fnm', async () => {
        const executor = executorAnswering('', REMOTE);
        const resolve = ownRepoNodeResolver(async () => '{"name":"x"}', executor, logger);

        expect(await resolve(SOURCE)).toStrictEqual({ ok: true, major: demoBuilderNode() });
        expect(executor.execute).not.toHaveBeenCalled();
    });

    it('reads the repo at its branch, and picks the Node its range needs', async () => {
        const read = jest.fn(async () => '{"engines":{"node":">=26"}}');
        const resolve = ownRepoNodeResolver(read, executorAnswering('* v24.21.0 default\n', REMOTE), logger);

        expect(await resolve(SOURCE)).toStrictEqual({ ok: true, major: '26' });
        expect(read).toHaveBeenCalledWith('acme', 'erp-bridge', 'package.json', 'main');
    });

    it('still answers when fnm cannot list releases (offline)', async () => {
        const resolve = ownRepoNodeResolver(
            async () => '{"engines":{"node":">=20"}}',
            executorAnswering('', new Error('offline')),
            logger,
        );
        expect(await resolve(SOURCE)).toStrictEqual({ ok: true, major: demoBuilderNode() });
    });
});

describe('githubRepoTextReader', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('reads through the SC\'s GitHub session first', async () => {
        const fileOps = { getFileContent: jest.fn().mockResolvedValue({ content: 'text' }) };
        global.fetch = jest.fn();

        expect(await githubRepoTextReader(fileOps)('acme', 'r', 'package.json', 'main')).toBe('text');
        expect(fileOps.getFileContent).toHaveBeenCalledWith('acme', 'r', 'package.json', 'main');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('falls back to an anonymous read of a public repo when there is no session', async () => {
        const fileOps = { getFileContent: jest.fn().mockRejectedValue(new Error('not signed in')) };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'public' });

        expect(await githubRepoTextReader(fileOps)('acme', 'r', 'package.json', 'main')).toBe('public');
        expect(global.fetch).toHaveBeenCalledWith('https://raw.githubusercontent.com/acme/r/main/package.json');
    });

    it('answers nothing when neither route can read it', async () => {
        const fileOps = { getFileContent: jest.fn().mockResolvedValue(null) };
        global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => '' });

        expect(await githubRepoTextReader(fileOps)('acme', 'r', 'package.json', 'main')).toBeUndefined();
    });
});
