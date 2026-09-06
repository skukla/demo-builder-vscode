/**
 * appConfigPackages — read + isolate an App Builder app's app.config.yaml runtime
 * packages. Isolation renames the standalone package(s) to a distinct derived
 * name so an integration deploys under its own package (the prune boundary in a
 * shared workspace). Extension/malformed configs have nothing to isolate.
 */

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn() } }));

import { promises as fsPromises } from 'fs';
import * as yaml from 'yaml';
import {
    applyIsolatedPackages,
    detectAppLayout,
    isolatePackages,
    listDeclaredPackageNames,
} from '@/features/app-builder/services/appConfigPackages';

const mockRead = fsPromises.readFile as jest.Mock;
const mockWrite = fsPromises.writeFile as jest.Mock;

/** A standalone app.config.yaml with the given package map. */
function config(packages: Record<string, unknown>): string {
    return yaml.stringify({ application: { runtimeManifest: { packages } } });
}

beforeEach(() => jest.clearAllMocks());

describe('isolatePackages (pure)', () => {
    it('renames a single package to exactly the derived name', () => {
        expect(isolatePackages({ myapp: { a: 1 } }, 'erp-x')).toEqual({ 'erp-x': { a: 1 } });
    });

    it('prefixes each package of a multi-package app (never collapses)', () => {
        expect(isolatePackages({ a: 1, b: 2 }, 'erp-x')).toEqual({ 'erp-x-a': 1, 'erp-x-b': 2 });
    });

    it('is idempotent — re-applying leaves already-isolated names unchanged', () => {
        expect(isolatePackages({ 'erp-x': { a: 1 } }, 'erp-x')).toEqual({ 'erp-x': { a: 1 } });
        expect(isolatePackages({ 'erp-x-a': 1, 'erp-x-b': 2 }, 'erp-x')).toEqual({
            'erp-x-a': 1,
            'erp-x-b': 2,
        });
    });
});

describe('detectAppLayout', () => {
    it('detects standalone for a standalone config', async () => {
        mockRead.mockResolvedValue(config({ myapp: { actions: {} } }));
        await expect(detectAppLayout('/c')).resolves.toBe('standalone');
    });

    it('returns undefined for a missing config file', async () => {
        mockRead.mockRejectedValue(new Error('ENOENT'));
        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    it('returns undefined for unparseable YAML', async () => {
        mockRead.mockResolvedValue(':\n  - [not valid');
        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    it('detects extension for an extension app (no standalone packages)', async () => {
        mockRead.mockResolvedValue(yaml.stringify({ extensions: { 'dx/excshell/1': {} } }));
        await expect(detectAppLayout('/c')).resolves.toBe('extension');
    });

    it('detects extension for the real integration-starter-kit v4 root config', async () => {
        // Verbatim from adobe/commerce-integration-starter-kit@main app.config.yaml
        // (fetched 2026-08-27) — the App Management shape this detector exists for.
        mockRead.mockResolvedValue(
            [
                'extensions:',
                '  # This extension is required for app management. Do not remove.',
                '  commerce/extensibility/1:',
                '    $include: src/commerce-extensibility-1/ext.config.yaml',
                '',
                'productDependencies:',
                '  - code: COMMC',
                '    minVersion: 2.4.4',
                '    maxVersion: 2.4.9',
            ].join('\n')
        );
        await expect(detectAppLayout('/c')).resolves.toBe('extension');
    });

    it('returns undefined for an empty packages map with no extensions', async () => {
        mockRead.mockResolvedValue(config({}));
        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    it('returns undefined for an empty extensions map', async () => {
        mockRead.mockResolvedValue(yaml.stringify({ extensions: {} }));
        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    it('reads a both-shapes config as standalone (the isolatable packages govern)', async () => {
        mockRead.mockResolvedValue(
            yaml.stringify({
                application: { runtimeManifest: { packages: { myapp: {} } } },
                extensions: { 'dx/excshell/1': {} },
            })
        );
        await expect(detectAppLayout('/c')).resolves.toBe('standalone');
    });
});

describe('applyIsolatedPackages', () => {
    it('rewrites the config with isolated package names and returns true', async () => {
        mockRead.mockResolvedValue(config({ application: { actions: {} } }));

        const applied = await applyIsolatedPackages('/c', 'erp-x');

        expect(applied).toBe(true);
        expect(mockWrite).toHaveBeenCalledTimes(1);
        const written = yaml.parse(mockWrite.mock.calls[0][1] as string);
        expect(Object.keys(written.application.runtimeManifest.packages)).toEqual(['erp-x']);
    });

    it('no-ops (returns false, no write) when there is nothing standalone to isolate', async () => {
        mockRead.mockResolvedValue(yaml.stringify({ extensions: { 'dx/excshell/1': {} } }));

        const applied = await applyIsolatedPackages('/c', 'erp-x');

        expect(applied).toBe(false);
        expect(mockWrite).not.toHaveBeenCalled();
    });
});

describe('listDeclaredPackageNames (AB-7 attribution ground truth)', () => {
    it('standalone: the runtimeManifest package keys', async () => {
        mockRead.mockResolvedValueOnce(config({ 'erp-x': {}, 'erp-x-b': {} }));

        await expect(listDeclaredPackageNames('/app')).resolves.toEqual(['erp-x', 'erp-x-b']);
    });

    it('extension: follows each $include to its runtimeManifest packages', async () => {
        mockRead
            .mockResolvedValueOnce(
                yaml.stringify({
                    extensions: {
                        'commerce/backend-ui/1': { $include: 'src/ext.config.yaml' },
                    },
                }),
            )
            .mockResolvedValueOnce(
                yaml.stringify({ runtimeManifest: { packages: { 'kit-a': {}, 'kit-b': {} } } }),
            );

        await expect(listDeclaredPackageNames('/app')).resolves.toEqual(['kit-a', 'kit-b']);
        expect(mockRead).toHaveBeenLastCalledWith('/app/src/ext.config.yaml', 'utf-8');
    });

    it('an unresolvable include is SKIPPED, never fatal — unattributable stays untouched', async () => {
        mockRead
            .mockResolvedValueOnce(
                yaml.stringify({
                    extensions: {
                        good: { $include: 'ok.yaml' },
                        broken: { $include: 'missing.yaml' },
                    },
                }),
            )
            .mockResolvedValueOnce(yaml.stringify({ runtimeManifest: { packages: { ok: {} } } }))
            .mockRejectedValueOnce(new Error('ENOENT'));

        await expect(listDeclaredPackageNames('/app')).resolves.toEqual(['ok']);
    });

    it('a missing or unparseable app.config answers empty, not a throw', async () => {
        mockRead.mockRejectedValueOnce(new Error('ENOENT'));
        await expect(listDeclaredPackageNames('/app')).resolves.toEqual([]);
    });
});

/**
 * Which file is read, and how.
 *
 * A mock answers whatever it is handed, so the only way to see a wrong path or a
 * missing encoding is to assert the CALL. Without `'utf-8'` `readFile` resolves a
 * Buffer, and `yaml.parse` on a Buffer is not the same operation.
 */
describe('the app.config.yaml read and write', () => {
    it('reads <componentPath>/app.config.yaml as utf-8 text', async () => {
        mockRead.mockResolvedValue(config({ myapp: {} }));

        await detectAppLayout('/components/erp-x');

        expect(mockRead).toHaveBeenCalledWith('/components/erp-x/app.config.yaml', 'utf-8');
    });

    it('writes the isolated config back to the same path as utf-8 text', async () => {
        mockRead.mockResolvedValue(config({ myapp: {} }));

        await applyIsolatedPackages('/components/erp-x', 'erp-x');

        expect(mockWrite).toHaveBeenCalledWith(
            '/components/erp-x/app.config.yaml',
            expect.stringContaining('erp-x'),
            'utf-8'
        );
    });
});

describe('detectAppLayout — configs that declare neither shape', () => {
    // `application:` with no runtimeManifest is the half-written case. It is not
    // standalone (nothing to isolate) and it is not an extension app.
    it('returns undefined for an application block with no runtimeManifest', async () => {
        mockRead.mockResolvedValue(yaml.stringify({ application: {} }));

        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    it('returns undefined for a runtimeManifest with no packages', async () => {
        mockRead.mockResolvedValue(yaml.stringify({ application: { runtimeManifest: {} } }));

        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    // `extensions:` written with nothing under it parses to null. It declares no
    // extension points, so it is not an extension app.
    it('returns undefined for an empty extensions key', async () => {
        mockRead.mockResolvedValue('extensions:\n');

        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });

    // A scalar where a map belongs. It has no extension points to delegate to, so
    // reading it as an extension app would send the add door past a config that
    // cannot deploy.
    it('returns undefined when extensions is not a map', async () => {
        mockRead.mockResolvedValue('extensions: dx/excshell/1\n');

        await expect(detectAppLayout('/c')).resolves.toBeUndefined();
    });
});

describe('isolatePackages — a multi-package app already carrying the derived name', () => {
    // `already` has to accept BOTH forms: the bare `owPackage` (what a formerly
    // single-package app was renamed to) and the `owPackage-` prefix. Checking only
    // the prefix re-prefixes the bare one on every redeploy — `erp-x`, then
    // `erp-x-erp-x`, then `erp-x-erp-x-erp-x` — and each new name is a new package
    // that `aio app deploy` no longer prunes.
    it('leaves a package named exactly the derived name alone', () => {
        expect(isolatePackages({ 'erp-x': { a: 1 }, other: { b: 2 } }, 'erp-x')).toEqual({
            'erp-x': { a: 1 },
            'erp-x-other': { b: 2 },
        });
    });
});

describe('applyIsolatedPackages — nothing to isolate', () => {
    it('returns false without reading a config that is not there', async () => {
        mockRead.mockRejectedValue(new Error('ENOENT'));

        await expect(applyIsolatedPackages('/c', 'erp-x')).resolves.toBe(false);
        expect(mockWrite).not.toHaveBeenCalled();
    });

    // A manifest with an EMPTY packages map has a runtimeManifest but nothing to
    // rename. Renaming "nothing" would write a manifest whose packages key is a
    // fresh empty object — a rewrite of a file we had no reason to touch.
    it('returns false for a runtimeManifest with an empty packages map', async () => {
        mockRead.mockResolvedValue(config({}));

        await expect(applyIsolatedPackages('/c', 'erp-x')).resolves.toBe(false);
        expect(mockWrite).not.toHaveBeenCalled();
    });
});

describe('listDeclaredPackageNames — configs that name nothing attributable', () => {
    it('reads the extension includes of a config that also has an empty application block', async () => {
        mockRead
            .mockResolvedValueOnce(
                yaml.stringify({
                    application: {},
                    extensions: { 'commerce/extensibility/1': { $include: 'src/ext.yaml' } },
                })
            )
            .mockResolvedValueOnce(yaml.stringify({ runtimeManifest: { packages: { kit: {} } } }));

        await expect(listDeclaredPackageNames('/app')).resolves.toEqual(['kit']);
    });

    // Every one of these is a config an SC could have hand-edited. AB-7 deletes
    // what it cannot attribute nothing — it must report fewer names, never throw
    // and leave the verification with no answer at all.
    it.each([
        ['an extension entry that is null', 'extensions:\n  commerce/extensibility/1:\n'],
        ['an extension entry with no $include', yaml.stringify({ extensions: { a: {} } })],
        [
            'an $include that is not a string',
            yaml.stringify({ extensions: { a: { $include: ['src/ext.yaml'] } } }),
        ],
    ])('skips %s', async (_label, doc) => {
        mockRead.mockResolvedValueOnce(doc);

        await expect(listDeclaredPackageNames('/app')).resolves.toStrictEqual([]);
    });

    it.each([
        ['an included file that is empty', ''],
        ['an included file with no runtimeManifest', yaml.stringify({ operations: {} })],
        ['an included runtimeManifest with no packages', yaml.stringify({ runtimeManifest: {} })],
    ])('names nothing for %s', async (_label, included) => {
        mockRead
            .mockResolvedValueOnce(
                yaml.stringify({ extensions: { a: { $include: 'src/ext.yaml' } } })
            )
            .mockResolvedValueOnce(included);

        await expect(listDeclaredPackageNames('/app')).resolves.toStrictEqual([]);
    });

    it('skips an include whose YAML does not parse, keeping the ones that do', async () => {
        mockRead
            .mockResolvedValueOnce(
                yaml.stringify({
                    extensions: {
                        good: { $include: 'ok.yaml' },
                        bad: { $include: 'bad.yaml' },
                    },
                })
            )
            .mockResolvedValueOnce(yaml.stringify({ runtimeManifest: { packages: { ok: {} } } }))
            .mockResolvedValueOnce(':\n  - [not valid');

        await expect(listDeclaredPackageNames('/app')).resolves.toEqual(['ok']);
    });
});
