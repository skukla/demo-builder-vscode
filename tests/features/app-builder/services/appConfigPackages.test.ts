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
