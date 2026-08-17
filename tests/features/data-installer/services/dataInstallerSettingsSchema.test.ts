/**
 * Guard: the Data Installer endpoint is NOT shipped as a default.
 *
 * This file used to assert the opposite — that a usable https default shipped so
 * the panel worked on first open, matching `demoBuilder.byom.overlayUrl` and
 * `demoBuilder.accsDiscovery.services`. That reasoning ran: access is gated by
 * the caller's Adobe IMS token, so the address is not the secret.
 *
 * It was overruled, deliberately, when the feature was pulled from develop
 * before beta.129: the bundled value was a **stage Adobe I/O Runtime endpoint**,
 * and this repository is PUBLIC. "Not a secret" and "fine to publish to everyone
 * who reads the repo" are different claims, and only the first was ever
 * established. Removing it later does not remove it from GitHub's storage, which
 * is why the default has to be absent rather than merely rotated.
 *
 * So the contract is now: the setting EXISTS (the feature needs somewhere to
 * read the endpoint from) and ships EMPTY. Each user points it at their own
 * deployment.
 *
 * The credential rules survive unchanged, and matter more now than before: if a
 * default is ever reintroduced, it must be https and must carry no credential —
 * no `?apiKey=`, no `?token=`, no `https://user:pass@host`. The failure mode is
 * silent, because the convenient thing to paste when an endpoint starts needing
 * a key is the whole working URL.
 *
 * The two remaining bundled endpoints (`byom.overlayUrl`,
 * `accsDiscovery.services`) are the same class of thing and were left alone here
 * — they are develop's status quo, not this feature's to change.
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const SETTING = 'demoBuilder.dataInstaller.apiBaseUrl';

interface SettingSchema {
    default?: unknown;
    description?: string;
    scope?: string;
}

function loadSettingSchema(name: string): SettingSchema | undefined {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'),
    );
    const sections: Array<{ properties?: Record<string, SettingSchema> }> = Array.isArray(
        packageJson.contributes.configuration,
    )
        ? packageJson.contributes.configuration
        : [packageJson.contributes.configuration];

    for (const section of sections) {
        const found = section.properties?.[name];
        if (found) {
            return found;
        }
    }
    return undefined;
}

describe('Data Installer settings schema', () => {
    it('declares the API URL setting — positive control for the assertions below', () => {
        expect(loadSettingSchema(SETTING)).toBeDefined();
    });

    /** The reason the feature was pulled from develop before beta.129. */
    it('ships NO endpoint default, because this repository is public', () => {
        expect(loadSettingSchema(SETTING)?.default).toBe('');
    });

    it('says in its description that the user must supply one', () => {
        const description = String(loadSettingSchema(SETTING)?.description ?? '');

        expect(description).toMatch(/required|no default/i);
    });

    /**
     * Unchanged, and load-bearing if a default is ever reintroduced. Written to
     * pass vacuously on the empty default rather than deleted — the rule outlives
     * the current value.
     */
    it('carries no credential if a default is ever set', () => {
        const value = String(loadSettingSchema(SETTING)?.default ?? '');
        if (!value) {
            expect(value).toBe('');
            return;
        }

        const url = new URL(value);
        expect(url.protocol).toBe('https:');
        expect(url.search).toBe('');
        expect(url.hash).toBe('');
        expect(url.username).toBe('');
        expect(url.password).toBe('');
    });

    it('names no credential-shaped key in the description', () => {
        const description = String(loadSettingSchema(SETTING)?.description ?? '');

        expect(description).not.toMatch(/api[_-]?key|secret|token|password/i);
    });
});
