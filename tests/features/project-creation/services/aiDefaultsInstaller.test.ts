/**
 * AI Defaults Installer Tests
 *
 * Verifies that the helper which mutates a storefront's package.json to add
 * ai-defaults.json packages as devDeps before `npm install` runs:
 *   - Adds each declared package at its declared version
 *   - Preserves existing devDeps and other fields
 *   - Is idempotent (re-running is safe)
 *   - Bails cleanly when the storefront package.json is missing
 */

import * as fsPromises from 'fs/promises';
import {
    applyAiDefaultsToStorefrontPackageJson,
    installAiDefaultsInStorefront,
} from '@/features/project-creation/services/aiDefaultsInstaller';
import { ServiceLocator } from '@/core/di/serviceLocator';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

const executeMock = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => ({ execute: executeMock })),
    },
}));

const STOREFRONT_PATH = '/projects/test/components/eds-storefront';
const PACKAGE_JSON_PATH = `${STOREFRONT_PATH}/package.json`;

function mockPackageJson(contents: Record<string, unknown>): void {
    (fsPromises.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(contents, null, 2));
}

function capturePackageJsonWrite(): Record<string, unknown> | undefined {
    const writeMock = fsPromises.writeFile as jest.Mock;
    const call = writeMock.mock.calls.find(([p]: [string]) => p === PACKAGE_JSON_PATH);
    if (!call) return undefined;
    return JSON.parse(call[1] as string) as Record<string, unknown>;
}

describe('applyAiDefaultsToStorefrontPackageJson', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('adds the Adobe App Builder MCP package as a devDependency', async () => {
        mockPackageJson({ name: 'storefront', version: '1.0.0', devDependencies: {} });

        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);

        const written = capturePackageJsonWrite();
        const devDeps = written?.devDependencies as Record<string, string> | undefined;
        expect(devDeps?.['@adobe-commerce/commerce-extensibility-tools']).toBe('^3.4.0');
    });

    it('creates the devDependencies object when the package.json has none', async () => {
        mockPackageJson({ name: 'storefront', version: '1.0.0' });

        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);

        const written = capturePackageJsonWrite();
        expect(written?.devDependencies).toBeDefined();
        expect((written?.devDependencies as Record<string, string>)['@adobe-commerce/commerce-extensibility-tools']).toBe(
            '^3.4.0',
        );
    });

    it('preserves existing devDependencies (does not overwrite unrelated entries)', async () => {
        mockPackageJson({
            name: 'storefront',
            version: '1.0.0',
            devDependencies: {
                typescript: '^5.0.0',
                eslint: '^9.0.0',
            },
        });

        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);

        const devDeps = (capturePackageJsonWrite()?.devDependencies as Record<string, string>) ?? {};
        expect(devDeps.typescript).toBe('^5.0.0');
        expect(devDeps.eslint).toBe('^9.0.0');
        expect(devDeps['@adobe-commerce/commerce-extensibility-tools']).toBe('^3.4.0');
    });

    it('preserves top-level fields (name, version, scripts, etc.)', async () => {
        mockPackageJson({
            name: 'storefront',
            version: '2.5.0',
            scripts: { build: 'webpack' },
            dependencies: { react: '^18.0.0' },
        });

        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);

        const written = capturePackageJsonWrite();
        expect(written?.name).toBe('storefront');
        expect(written?.version).toBe('2.5.0');
        expect(written?.scripts).toEqual({ build: 'webpack' });
        expect(written?.dependencies).toEqual({ react: '^18.0.0' });
    });

    it('is idempotent — running twice produces the same package.json', async () => {
        const initial = { name: 'storefront', version: '1.0.0', devDependencies: {} };
        mockPackageJson(initial);
        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);
        const firstWrite = capturePackageJsonWrite();

        (fsPromises.writeFile as jest.Mock).mockClear();
        mockPackageJson(firstWrite as Record<string, unknown>);
        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);
        const secondWrite = capturePackageJsonWrite();

        expect(secondWrite).toEqual(firstWrite);
    });

    it('overwrites an outdated version with the version declared in ai-defaults.json', async () => {
        mockPackageJson({
            name: 'storefront',
            version: '1.0.0',
            devDependencies: {
                '@adobe-commerce/commerce-extensibility-tools': '^2.0.0',
            },
        });

        await applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH);

        const devDeps = (capturePackageJsonWrite()?.devDependencies as Record<string, string>) ?? {};
        expect(devDeps['@adobe-commerce/commerce-extensibility-tools']).toBe('^3.4.0');
    });

    it('throws a clear error when the storefront package.json is missing', async () => {
        (fsPromises.readFile as jest.Mock).mockRejectedValueOnce(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        await expect(applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH)).rejects.toThrow(
            /package\.json/,
        );
    });

    it('throws a clear error when the storefront package.json is malformed JSON', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce('{ not valid json');

        await expect(applyAiDefaultsToStorefrontPackageJson(STOREFRONT_PATH)).rejects.toThrow();
    });
});

describe('installAiDefaultsInStorefront', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
        // Default: package.json read returns a minimal valid storefront so the
        // applyAiDefaults step succeeds; tests can override per-case.
        (fsPromises.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ name: 'storefront', version: '1.0.0' }),
        );
    });

    it('reapplies devDeps to package.json and then runs npm install in the storefront', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        const result = await installAiDefaultsInStorefront(STOREFRONT_PATH);

        expect(fsPromises.writeFile).toHaveBeenCalledWith(
            PACKAGE_JSON_PATH,
            expect.stringContaining('@adobe-commerce/commerce-extensibility-tools'),
            'utf-8',
        );
        expect(ServiceLocator.getCommandExecutor).toHaveBeenCalledTimes(1);
        expect(executeMock).toHaveBeenCalledWith(
            'npm install',
            expect.objectContaining({ cwd: STOREFRONT_PATH }),
        );
        expect(result).toEqual({ success: true });
    });

    it('reports failure with a clear error when npm install exits non-zero', async () => {
        executeMock.mockResolvedValue({
            code: 1,
            stdout: '',
            stderr: 'npm ERR! 404 Not Found - @some/package',
        });

        const result = await installAiDefaultsInStorefront(STOREFRONT_PATH);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/npm install/);
        expect(result.error).toMatch(/code 1/);
        expect(result.error).toMatch(/404 Not Found/);
    });

    it('reports failure when the command executor throws', async () => {
        executeMock.mockRejectedValue(new Error('ENOENT: npm not found'));

        const result = await installAiDefaultsInStorefront(STOREFRONT_PATH);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/npm not found/);
    });

    it('reports failure when the package.json mutation step throws', async () => {
        (fsPromises.readFile as jest.Mock).mockReset();
        (fsPromises.readFile as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        const result = await installAiDefaultsInStorefront(STOREFRONT_PATH);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/package\.json/);
        // npm install should NOT run if the prep step failed.
        expect(executeMock).not.toHaveBeenCalled();
    });
});
