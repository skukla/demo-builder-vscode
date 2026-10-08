/**
 * fnmCommands: what an install step runs, what it is called, and how it is spawned.
 */

import { resolveCommands, resolveStepName, spawnCommand } from '@/core/utils/progressUnifier/fnmCommands';
import type { IProcessSpawner } from '@/core/utils/progressUnifier/types';
import { nodeFolderPath } from '@/core/shell/nodeFolder';
import type { InstallStep } from '@/types/prerequisites';

const step = (overrides: Partial<InstallStep>): InstallStep => ({
    name: 'Install for Node {version}',
    message: 'Installing...',
    progressStrategy: 'immediate',
    ...overrides,
});

describe('resolveCommands', () => {
    it('uses the static commands list as given', () => {
        expect(resolveCommands(step({ commands: ['npm i', 'npm test'] }))).toStrictEqual([
            'npm i',
            'npm test',
        ]);
    });

    it('runs a template with no placeholder as it is', () => {
        expect(resolveCommands(step({ commandTemplate: 'brew install fnm' }))).toStrictEqual([
            'brew install fnm',
        ]);
    });

    it('substitutes every {version} when a Node version is named, and wraps it in fnm exec', () => {
        expect(
            resolveCommands(step({ commandTemplate: 'fnm install {version} && echo {version}' }), {
                nodeVersion: '24',
            }),
        ).toStrictEqual(['fnm install 24 && echo 24']);
    });

    it('runs nothing when the template needs a version and none is given', () => {
        expect(resolveCommands(step({ commandTemplate: 'fnm install {version}' }))).toStrictEqual([]);
    });

    it('runs nothing when the step has neither commands nor a template', () => {
        expect(resolveCommands(step({}), { nodeVersion: '24' })).toStrictEqual([]);
    });

    it('wraps non-fnm commands in fnm exec on the named Node, leaving fnm commands alone', () => {
        expect(
            resolveCommands(step({ commands: ['npm install -g x', 'fnm use 24'] }), { nodeVersion: '24' }),
        ).toStrictEqual(['fnm exec --using=24 npm install -g x', 'fnm use 24']);
    });

    it('does not wrap when no Node version is named', () => {
        expect(resolveCommands(step({ commands: ['npm install -g x'] }))).toStrictEqual([
            'npm install -g x',
        ]);
    });
});

describe('resolveStepName', () => {
    it('substitutes every {version} when a Node version is named', () => {
        expect(resolveStepName(step({ name: 'Node {version} ({version})' }), { nodeVersion: '20' })).toBe(
            'Node 20 (20)',
        );
    });

    it('leaves the name alone when no Node version is named', () => {
        expect(resolveStepName(step({}))).toBe('Install for Node {version}');
    });
});

describe('spawnCommand', () => {
    const spawner = jest.fn() as unknown as jest.MockedFunction<IProcessSpawner>;

    beforeEach(() => {
        spawner.mockReset();
    });

    it('prefixes fnm commands with the fnm environment and runs them in a shell', () => {
        spawnCommand(spawner, 'fnm install 24');

        const [command, args, options] = spawner.mock.calls[0];
        expect(command).toBe('eval "$(fnm env)" && fnm install 24');
        expect(args).toStrictEqual([]);
        expect(options).toMatchObject({ shell: true });
    });

    it('runs other commands unchanged', () => {
        spawnCommand(spawner, 'npm install -g x');

        expect(spawner.mock.calls[0][0]).toBe('npm install -g x');
    });

    it("puts Demo Builder's Node folder on the child and switches colour output off", () => {
        spawnCommand(spawner, 'npm install -g x');

        const env = spawner.mock.calls[0][2].env as NodeJS.ProcessEnv;
        expect(env.FNM_DIR).toBe(nodeFolderPath());
        expect(env.PATH).toBe(process.env.PATH);
        expect(env.NO_COLOR).toBe('1');
        expect(env.FORCE_COLOR).toBe('0');
    });
});
