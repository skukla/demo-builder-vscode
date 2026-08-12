/**
 * Guard: the shipped Data Installer endpoint default carries no credential.
 *
 * The endpoint itself IS shipped as a default, matching the house pattern —
 * `demoBuilder.byom.overlayUrl`, `demoBuilder.accsDiscovery.services` and
 * `demoBuilder.daLive.aemAuthorUrl` all ship the team's deployed infrastructure so
 * the feature works on first open. Access is gated by the caller's Adobe IMS token
 * (`dataInstallerClient` sends it as `Bearer`), not by knowing the URL, so the
 * address is not the secret.
 *
 * What must never ship is a credential riding along IN that URL — an `?apiKey=`,
 * a `?token=`, or `https://user:pass@host`. This repo is PUBLIC, so a default is
 * published to everyone who reads it, and force-pushing one back out does not
 * remove it from GitHub's storage.
 *
 * That is also why `fingerprintUrl` logs scheme and host only: the same
 * possibility — a secret in a query string — is handled at both ends.
 *
 * A guard test rather than a code comment because the failure mode is silent: the
 * convenient thing to paste when an endpoint starts needing a key is the whole
 * working URL.
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const SETTING = 'demoBuilder.dataInstaller.apiBaseUrl';

interface SettingSchema {
    default?: unknown;
    description?: string;
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

/** The shipped default, parsed. Throws if it is not a URL — which is the point. */
function shippedDefault(): URL {
    return new URL(String(loadSettingSchema(SETTING)?.default ?? ''));
}

describe('Data Installer settings schema', () => {
    it('declares the API URL setting — positive control for the assertions below', () => {
        expect(loadSettingSchema(SETTING)).toBeDefined();
    });

    it('ships a usable https default so the panel works on first open', () => {
        // `resolveDataInstallerBaseUrl` accepts https only, so an http default
        // would ship a value the feature itself rejects.
        expect(shippedDefault().protocol).toBe('https:');
    });

    it('carries no credential in the default URL', () => {
        const url = shippedDefault();

        // A query string or fragment is where an apiKey/token gets pasted;
        // userinfo is the other way a credential rides in a URL.
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
