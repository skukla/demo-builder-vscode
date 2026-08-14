/**
 * Settings that name a CREDENTIAL SINK must be machine-scoped.
 *
 * A VS Code setting with no `scope` defaults to window scope, which means a
 * workspace's own `.vscode/settings.json` can override it. Three settings name a
 * host that the extension then sends secrets to:
 *
 * - `demoBuilder.dataInstaller.apiBaseUrl` — receives Commerce credentials
 *   (PaaS admin pair or ACCS client id/secret) in the request body, with the
 *   user's live Adobe IMS token in the Authorization header.
 * - `demoBuilder.accsDiscovery.services` — receives the IMS token.
 * - `demoBuilder.byom.overlayUrl` — the storefront overlay origin.
 *
 * Sharing a demo project FOLDER is this extension's core workflow, so a
 * window-scoped sink is a credential-exfiltration path: open a shared folder,
 * press Dry run, and the secrets go wherever that folder's settings file says.
 * `machine` scope makes the value user-level only and ignores any workspace
 * override.
 *
 * Found by a security review pass on 2026-08-14. Guarded here rather than fixed
 * and forgotten, because the failure is silent — nothing about the UI differs
 * when the host has been redirected.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Every setting whose value decides WHERE a secret is sent. */
const CREDENTIAL_SINK_SETTINGS = [
    'demoBuilder.dataInstaller.apiBaseUrl',
    'demoBuilder.accsDiscovery.services',
    'demoBuilder.byom.overlayUrl',
];

interface PackageJson {
    contributes: {
        configuration: Array<{
            properties?: Record<string, { scope?: string }>;
        }>;
    };
}

function readSettings(): Record<string, { scope?: string }> {
    const raw = fs.readFileSync(
        path.join(__dirname, '..', '..', 'package.json'),
        'utf-8',
    );
    const pkg = JSON.parse(raw) as PackageJson;
    const merged: Record<string, { scope?: string }> = {};
    for (const section of pkg.contributes.configuration) {
        Object.assign(merged, section.properties ?? {});
    }
    return merged;
}

describe('credential-sink settings', () => {
    const settings = readSettings();

    // Positive control: the reader actually finds settings. Without this, a
    // path or shape change would empty the map and pass every assertion below.
    it('reads the contributed settings at all', () => {
        expect(Object.keys(settings).length).toBeGreaterThan(10);
        expect(settings['demoBuilder.dataInstaller.apiBaseUrl']).toBeDefined();
    });

    it.each(CREDENTIAL_SINK_SETTINGS)(
        '%s is machine-scoped, so a workspace file cannot redirect it',
        (key) => {
            expect(settings[key]).toBeDefined();
            expect(settings[key].scope).toBe('machine');
        },
    );
});
