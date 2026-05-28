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
import { applyAiDefaultsToStorefrontPackageJson } from '@/features/project-creation/services/aiDefaultsInstaller';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
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
