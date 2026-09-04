/**
 * saveProjectConfig's decisions BEFORE the manifest is built.
 *
 * Three of them, in order: whether to save at all (a stale save from a
 * background poller must not resurrect a deleted project directory), whether
 * the directory can be created, and whether the path is a usable string. Then
 * the .env file, which is the one thing the writer emits that is NOT the
 * manifest — and the only place the four commerce values are flattened.
 *
 * Every assertion here is about the ARGUMENTS fs receives, or the absence of
 * any call; the mocked fs answers the same whatever it is handed.
 */

import * as path from 'path';
import type { Project } from '@/types/base';
import {
    ProjectConfigWriter,
    createTestProject,
    mockFs,
    mockLogger,
    resetFsMocks,
} from './projectConfigWriter.testUtils';

const PROJECT_PATH = '/projects/bodea';
const ENOENT = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });

/**
 * A project whose `path` is deliberately NOT what the type allows.
 *
 * The guard under test exists for exactly the values the compiler forbids, so
 * this is the one place a cast is the honest way in: it names the malformed
 * value in the test rather than hiding it in a fixture.
 */
function projectWithPath(value: unknown): Project {
    return createTestProject({ path: value as string });
}

function envWrite(): [string, string] | undefined {
    const call = mockFs.writeFile.mock.calls.find(([target]) => String(target).endsWith('.env'));
    return call ? [String(call[0]), String(call[1])] : undefined;
}

describe('ProjectConfigWriter.saveProjectConfig — the stale-save guard', () => {
    let writer: ProjectConfigWriter;

    beforeEach(() => {
        resetFsMocks();
        writer = new ProjectConfigWriter(mockLogger);
    });

    it('checks the project directory before anything else', async () => {
        await writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH);

        expect(mockFs.access).toHaveBeenCalledWith(PROJECT_PATH);
        expect(mockFs.access.mock.invocationCallOrder[0]).toBeLessThan(
            mockFs.mkdir.mock.invocationCallOrder[0],
        );
    });

    it('skips the save when the directory is gone and no project is current', async () => {
        mockFs.access.mockRejectedValue(ENOENT);

        await writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }));

        expect(mockFs.mkdir).not.toHaveBeenCalled();
        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('skips the save when the directory is gone and a DIFFERENT project is current', async () => {
        mockFs.access.mockRejectedValue(ENOENT);

        await writer.saveProjectConfig(
            createTestProject({ path: PROJECT_PATH }),
            '/projects/some-other-project',
        );

        expect(mockFs.mkdir).not.toHaveBeenCalled();
        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('creates the directory when it is gone but this IS the current project', async () => {
        // A brand-new project has no directory yet; that is the one legitimate
        // reason the path is missing, and it is told apart by the current path.
        mockFs.access.mockRejectedValue(ENOENT);

        await writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH);

        expect(mockFs.mkdir).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true });
        expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('creates the directory recursively even when it already exists', async () => {
        await writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH);

        expect(mockFs.mkdir).toHaveBeenCalledTimes(1);
        expect(mockFs.mkdir).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true });
    });

    it('logs and rethrows when the directory cannot be created, writing nothing', async () => {
        const failure = new Error('EACCES: permission denied');
        mockFs.mkdir.mockRejectedValue(failure);

        await expect(
            writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH),
        ).rejects.toBe(failure);

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to create project directory', failure);
        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('logs a non-Error mkdir failure without a cause', async () => {
        mockFs.mkdir.mockRejectedValue('disk went away');

        await expect(
            writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH),
        ).rejects.toBe('disk went away');

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to create project directory', undefined);
    });
});

describe('ProjectConfigWriter.saveProjectConfig — the path guard', () => {
    let writer: ProjectConfigWriter;

    beforeEach(() => {
        resetFsMocks();
        writer = new ProjectConfigWriter(mockLogger);
    });

    it.each([
        ['an empty string', ''],
        ['whitespace only', '   '],
        ['undefined', undefined],
        ['a number', 42],
    ])('refuses %s as a project path and writes nothing', async (_label, value) => {
        await expect(
            writer.saveProjectConfig(projectWithPath(value), PROJECT_PATH),
        ).rejects.toThrow(`Invalid project path: "${String(value)}"`);

        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('accepts a path with inner whitespace', async () => {
        await writer.saveProjectConfig(
            createTestProject({ path: '/projects/my demo' }),
            '/projects/my demo',
        );

        expect(mockFs.writeFile).toHaveBeenCalledWith(
            path.join('/projects/my demo', '.demo-builder.json.tmp'),
            expect.any(String),
        );
    });
});

describe('ProjectConfigWriter.saveProjectConfig — the .env file', () => {
    let writer: ProjectConfigWriter;

    beforeEach(() => {
        resetFsMocks();
        writer = new ProjectConfigWriter(mockLogger);
    });

    it('flattens the commerce instance into the four COMMERCE_ keys, in this exact shape', async () => {
        const project = createTestProject({
            name: 'bodea-demo',
            path: PROJECT_PATH,
            commerce: {
                type: 'platform-as-a-service',
                instance: {
                    url: 'https://commerce.example',
                    environmentId: 'env-42',
                    storeCode: 'bodea_store',
                    storeView: 'default',
                    websiteCode: 'base',
                },
            },
        });

        await writer.saveProjectConfig(project, PROJECT_PATH);

        const [target, content] = envWrite() ?? [];
        expect(target).toBe(path.join(PROJECT_PATH, '.env'));
        expect(content).toBe(
            [
                '# Demo Builder Configuration',
                'PROJECT_NAME=bodea-demo',
                '',
                '# Commerce Configuration',
                'COMMERCE_URL=https://commerce.example',
                'COMMERCE_ENV_ID=env-42',
                'COMMERCE_STORE_CODE=bodea_store',
                'COMMERCE_STORE_VIEW=default',
                '',
                "# Note: Component-specific environment variables are stored in each component's .env file",
            ].join('\n'),
        );
    });

    it('writes every COMMERCE_ key empty when the project has no commerce config', async () => {
        await writer.saveProjectConfig(
            createTestProject({ name: 'no-commerce', path: PROJECT_PATH, commerce: undefined }),
            PROJECT_PATH,
        );

        const [, content] = envWrite() ?? [];
        expect(content).toContain('PROJECT_NAME=no-commerce\n');
        expect(content).toContain('\nCOMMERCE_URL=\n');
        expect(content).toContain('\nCOMMERCE_ENV_ID=\n');
        expect(content).toContain('\nCOMMERCE_STORE_CODE=\n');
        expect(content).toContain('\nCOMMERCE_STORE_VIEW=\n');
    });

    it('writes a key empty when its one value is missing, keeping the others', async () => {
        await writer.saveProjectConfig(
            createTestProject({
                path: PROJECT_PATH,
                commerce: {
                    type: 'software-as-a-service',
                    instance: {
                        url: 'https://commerce.example',
                        environmentId: '',
                        storeCode: 'bodea_store',
                        storeView: '',
                        websiteCode: 'base',
                    },
                },
            }),
            PROJECT_PATH,
        );

        const [, content] = envWrite() ?? [];
        expect(content).toContain('\nCOMMERCE_URL=https://commerce.example\n');
        expect(content).toContain('\nCOMMERCE_ENV_ID=\n');
        expect(content).toContain('\nCOMMERCE_STORE_CODE=bodea_store\n');
        expect(content).toContain('\nCOMMERCE_STORE_VIEW=\n');
    });

    it('writes the .env AFTER the manifest has been renamed into place', async () => {
        await writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH);

        const envIndex = mockFs.writeFile.mock.calls.findIndex(([target]) =>
            String(target).endsWith('.env'),
        );
        expect(envIndex).toBeGreaterThanOrEqual(0);
        expect(mockFs.writeFile.mock.invocationCallOrder[envIndex]).toBeGreaterThan(
            mockFs.rename.mock.invocationCallOrder[0],
        );
    });

    it('logs and rethrows when the .env write fails', async () => {
        const failure = new Error('EROFS: read-only file system');
        mockFs.writeFile.mockImplementation(async (target) => {
            if (String(target).endsWith('.env')) throw failure;
        });

        await expect(
            writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH),
        ).rejects.toBe(failure);

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to create .env file', failure);
    });

    it('logs a non-Error .env failure without a cause', async () => {
        mockFs.writeFile.mockImplementation(async (target) => {
            if (String(target).endsWith('.env')) throw 'quota';
        });

        await expect(
            writer.saveProjectConfig(createTestProject({ path: PROJECT_PATH }), PROJECT_PATH),
        ).rejects.toBe('quota');

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to create .env file', undefined);
    });
});
