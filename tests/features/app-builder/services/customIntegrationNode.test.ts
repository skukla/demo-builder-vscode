/**
 * Reading a custom integration's repo for the Node it needs (PR-1a step 8): the repo reader's
 * two routes, and the resolver composed from it and the executor.
 */

import { githubRepoTextReader, customIntegrationNodeResolver } from '@/features/app-builder/services/customIntegrationNode';
import { demoBuilderNode } from '@/core/shell/demoBuilderNode';
import type { CommandResult } from '@/core/shell/types';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createSuccessResult } from '../../../helpers/commandResultFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const logger = createMockLogger();
const SOURCE = { owner: 'acme', repo: 'erp-bridge', branch: 'main' };


/** An executor answering `fnm list` and `fnm list-remote` with what it is given. */
function executorAnswering(list: string, remote: string | Error) {
    return createMockCommandExecutor({
        execute: jest.fn(async (command: string): Promise<CommandResult> => {
            if (command !== 'fnm list-remote') return createSuccessResult(list);
            if (remote instanceof Error) throw remote;
            return createSuccessResult(remote);
        }),
    });
}

const REMOTE = 'v22.23.3 (Jod)\nv24.21.0 (Krypton)\nv26.11.0\n';

describe('customIntegrationNodeResolver', () => {
    it("answers Demo Builder's Node for a repo with no range, without asking fnm", async () => {
        const executor = executorAnswering('', REMOTE);
        const resolve = customIntegrationNodeResolver(async () => '{"name":"x"}', executor, logger);

        expect(await resolve(SOURCE)).toStrictEqual({ ok: true, major: demoBuilderNode() });
        expect(executor.execute).not.toHaveBeenCalled();
    });

    it('reads the repo at its branch, and picks the Node its range needs', async () => {
        const read = jest.fn(async () => '{"engines":{"node":">=26"}}');
        const resolve = customIntegrationNodeResolver(read, executorAnswering('* v24.21.0 default\n', REMOTE), logger);

        expect(await resolve(SOURCE)).toStrictEqual({ ok: true, major: '26' });
        expect(read).toHaveBeenCalledWith('acme', 'erp-bridge', 'package.json', 'main');
    });

    it('still answers when fnm cannot list releases (offline)', async () => {
        const resolve = customIntegrationNodeResolver(
            async () => '{"engines":{"node":">=20"}}',
            executorAnswering('', new Error('offline')),
            logger,
        );
        expect(await resolve(SOURCE)).toStrictEqual({ ok: true, major: demoBuilderNode() });
    });
});

describe('githubRepoTextReader', () => {
    const reader = (answer: { content: string } | null | Error) => ({
        getFileContent: jest.fn(async () => {
            if (answer instanceof Error) throw answer;
            return answer;
        }),
    });

    it("reads through the SC's GitHub session first", async () => {
        const signedIn = reader({ content: 'text' });
        const anonymous = reader({ content: 'public' });

        expect(await githubRepoTextReader(signedIn, anonymous)('acme', 'r', 'package.json', 'main')).toBe('text');
        expect(signedIn.getFileContent).toHaveBeenCalledWith('acme', 'r', 'package.json', 'main');
        expect(anonymous.getFileContent).not.toHaveBeenCalled();
    });

    it('falls back to the anonymous public reader when there is no session', async () => {
        const anonymous = reader({ content: 'public' });

        expect(await githubRepoTextReader(reader(new Error('not signed in')), anonymous)('acme', 'r', 'package.json'))
            .toBe('public');
        expect(anonymous.getFileContent).toHaveBeenCalledWith('acme', 'r', 'package.json', undefined);
    });

    it('answers nothing when neither reader has the file', async () => {
        expect(await githubRepoTextReader(reader(null), reader(new Error('404')))('acme', 'r', 'package.json'))
            .toBeUndefined();
    });
});
