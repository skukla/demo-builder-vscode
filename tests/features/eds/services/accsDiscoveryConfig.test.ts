/**
 * Selecting the shared discovery service.
 *
 * `selectDiscoveryService` had no test of its own — the rule lived only in the
 * consumers that call it — so the selection rule is pinned here.
 */

import * as vscode from 'vscode';
import { selectDiscoveryService } from '@/features/eds/services/accsDiscoveryConfig';


/** Seed `demoBuilder.accsDiscovery.services` with the given entries. */
function seedServices(services: unknown[]): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(services),
    });
}

/**
 * The setting is ABSENT — the state of every install that has never configured
 * one, which is most of them. This `get` hands back the default the caller
 * supplied instead of a canned value, so the default itself is under test
 * rather than mocked away.
 */
function seedUnsetSetting(): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_key: string, fallback: unknown) => fallback),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('selectDiscoveryService', () => {
    it('prefers the entry whose orgId matches', () => {
        seedServices([
            { orgName: 'A', orgId: '111', serviceUrl: 'https://a.example.com/discover-stores' },
            { orgName: 'B', orgId: '222', serviceUrl: 'https://b.example.com/discover-stores' },
        ]);

        expect(selectDiscoveryService('222')).toEqual({
            ok: true,
            serviceUrl: 'https://b.example.com/discover-stores',
        });
    });

    // The fallback the broker depends on: a project with NO Adobe binding passes
    // undefined, and a single-entry setup must still work.
    it('falls back to the first entry when the org does not match', () => {
        seedServices([
            { orgName: 'A', orgId: '111', serviceUrl: 'https://a.example.com/discover-stores' },
        ]);

        expect(selectDiscoveryService('999')).toEqual({
            ok: true,
            serviceUrl: 'https://a.example.com/discover-stores',
        });
        expect(selectDiscoveryService(undefined)).toEqual({
            ok: true,
            serviceUrl: 'https://a.example.com/discover-stores',
        });
    });

    it('reports none-configured on an empty list', () => {
        seedServices([]);

        expect(selectDiscoveryService()).toEqual({ ok: false, reason: 'none-configured' });
    });

    /**
     * An install that has never configured a service must report exactly that.
     * The default the module asks VS Code for is what makes it true — a
     * non-empty default would take this path into URL validation and report a
     * broken configuration instead of an absent one, which sends the user at
     * the wrong fix.
     */
    it('reports none-configured when the setting has never been set', () => {
        seedUnsetSetting();

        expect(selectDiscoveryService()).toEqual({ ok: false, reason: 'none-configured' });
    });

    /**
     * WHICH setting it reads. A wrong section or key returns the default from
     * every install that HAS configured a service, and the symptom is
     * "none-configured" on a machine the user can see the setting on — the one
     * failure the reason string actively argues against. Cheap to pin, and this
     * repo has shipped a wrong setting identifier before.
     */
    it('reads demoBuilder.accsDiscovery.services and nothing else', () => {
        seedUnsetSetting();

        selectDiscoveryService();

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
            'demoBuilder.accsDiscovery'
        );
        const config = (vscode.workspace.getConfiguration as jest.Mock).mock.results[0].value;
        expect(config.get).toHaveBeenCalledWith('services', []);
    });

    it('reports invalid-url for a non-https entry', () => {
        seedServices([{ orgName: 'A', serviceUrl: 'http://insecure.example.com/discover-stores' }]);

        expect(selectDiscoveryService()).toEqual({ ok: false, reason: 'invalid-url' });
    });
});
