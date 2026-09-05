/**
 * ComponentInstallation — version detection and the files install writes.
 *
 * detectVersion is a three-strategy ladder, and which rung answers decides
 * what the dashboard shows as the component's version: a git tag first, then
 * package.json, then the short commit hash. Each rung's ENTRY condition is
 * pinned here, because a ladder tested only at the top reports nothing when
 * the top rung is what broke.
 */

import {
    COMPONENT_PATH,
    DEFAULT_SHELL,
    executeCall,
    install,
    instance,
    makeDef,
    mockExecute,
    mockFs,
    resetDoubles,
} from './componentInstallation.testUtils';

/**
 * Answer each git command by NAME rather than by call order.
 *
 * `mockResolvedValueOnce` cannot express this: which detection commands run
 * depends on which rung answers, so an unconsumed queued value leaks into the
 * next test and fails its CLONE — which is what happened here first time.
 */
function detectionAnswers(
    tag: { code: number; stdout: string },
    commit: { code: number; stdout: string } = { code: 1, stdout: '' }
) {
    mockExecute.mockImplementation(async (command: string) => {
        if (command.startsWith('git describe')) return { stderr: '', ...tag };
        if (command.startsWith('git rev-parse')) return { stderr: '', ...commit };
        return { code: 0, stdout: '', stderr: '' };
    });
}

beforeEach(resetDoubles);

describe('detectVersion — strategy 1, the git tag', () => {
    it('asks git for an exact tag match in the cloned directory', async () => {
        await install();

        expect(executeCall(1)).toEqual([
            'git describe --tags --exact-match HEAD',
            { cwd: COMPONENT_PATH, enhancePath: true, shell: DEFAULT_SHELL },
        ]);
    });

    it('records the tag, with the v prefix stripped and whitespace trimmed', async () => {
        detectionAnswers({ code: 0, stdout: 'v2.0.0\n' });

        const result = await install();

        expect(result.component?.version).toBe('2.0.0');
    });

    it('strips only a LEADING v — a v elsewhere in the tag stays', async () => {
        detectionAnswers({ code: 0, stdout: '1.0.0-preview\n' });

        const result = await install();

        expect(result.component?.version).toBe('1.0.0-preview');
    });

    it('ignores a tag lookup that FAILED even when it printed something', async () => {
        detectionAnswers({ code: 128, stdout: 'fatal: no tag' }, { code: 0, stdout: 'abcdef1234567890' });

        const result = await install();

        expect(result.component?.version).toBe('abcdef12');
    });

    it('ignores whitespace-only output from a successful lookup', async () => {
        detectionAnswers({ code: 0, stdout: '  \n' }, { code: 0, stdout: 'abcdef1234567890' });

        const result = await install();

        expect(result.component?.version).toBe('abcdef12');
    });
});

describe('detectVersion — strategy 2, package.json', () => {
    it('falls back to the package.json version when there is no tag', async () => {
        detectionAnswers({ code: 0, stdout: '' });
        mockFs.access.mockImplementation(async (p: string) =>
            p.endsWith('package.json') ? undefined : Promise.reject(new Error('ENOENT'))
        );
        mockFs.readFile.mockResolvedValue(JSON.stringify({ version: '1.2.3' }));

        const result = await install();

        expect(result.component?.version).toBe('1.2.3');
    });

    it('falls through to the commit hash when package.json declares no version', async () => {
        detectionAnswers({ code: 0, stdout: '' }, { code: 0, stdout: 'abcdef1234567890' });
        mockFs.access.mockResolvedValue(undefined);
        mockFs.readFile.mockResolvedValue(JSON.stringify({ name: 'thing' }));

        const result = await install();

        expect(result.component?.version).toBe('abcdef12');
    });

    it('falls through to the commit hash when package.json is unreadable', async () => {
        detectionAnswers({ code: 0, stdout: '' }, { code: 0, stdout: 'abcdef1234567890' });

        const result = await install();

        expect(result.component?.version).toBe('abcdef12');
    });
});

describe('detectVersion — strategy 3, the commit hash', () => {
    it('asks git for HEAD in the cloned directory', async () => {
        await install();

        expect(executeCall(2)).toEqual([
            'git rev-parse HEAD',
            { cwd: COMPONENT_PATH, enhancePath: true, shell: DEFAULT_SHELL },
        ]);
    });

    it('records the first eight characters of the hash', async () => {
        detectionAnswers({ code: 0, stdout: '' }, { code: 0, stdout: 'abcdef1234567890\n' });

        const result = await install();

        expect(result.component?.version).toBe('abcdef12');
    });

    it('trims the hash BEFORE truncating it, so padding never eats the version', async () => {
        // The eight characters must come from the hash, not from whitespace
        // around it — truncating first would record "  abcdef".
        detectionAnswers({ code: 0, stdout: '' }, { code: 0, stdout: '  abcdef1234567890  ' });

        const result = await install();

        expect(result.component?.version).toBe('abcdef12');
    });

    it('records NO version when even rev-parse fails', async () => {
        detectionAnswers({ code: 0, stdout: '' }, { code: 128, stdout: 'fatal: not a repository' });

        const result = await install();

        expect(result.component?.version).toBeUndefined();
    });
});

describe('the Node version the component runs on', () => {
    const withNode = () =>
        makeDef({ configuration: { nodeVersion: '20.11.0' } } as Record<string, unknown>);

    it('records the configured version in the instance metadata, keeping what was there', async () => {
        const existing = instance({ metadata: { daLiveOrg: 'acme' } });

        const result = await install(withNode(), {}, existing);

        expect(result.component?.metadata).toEqual({ daLiveOrg: 'acme', nodeVersion: '20.11.0' });
    });

    it('leaves metadata alone when no Node version is configured', async () => {
        const result = await install();

        expect(result.component?.metadata).toBeUndefined();
    });

    it('writes .node-version so fnm switches automatically', async () => {
        await install(withNode());

        expect(mockFs.writeFile).toHaveBeenCalledWith(
            `${COMPONENT_PATH}/.node-version`,
            '20.11.0\n',
            'utf-8'
        );
    });

    it('does NOT overwrite an existing .node-version', async () => {
        mockFs.access.mockResolvedValue(undefined);

        await install(withNode());

        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('writes nothing when no Node version is configured', async () => {
        await install();

        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
});
