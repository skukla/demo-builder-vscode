/**
 * Selecting the shared service, and deriving its credential endpoint.
 *
 * `selectDiscoveryService` had no test of its own — the rule lived only in the
 * two consumers that call it. Adding a third consumer (the Data Installer
 * credential broker) is the point at which that stops being acceptable, so the
 * existing selection rule is pinned here alongside the new derivation.
 *
 * The derivation matters for a reason beyond tidiness: it is what stops a
 * misconfigured setting from building a credential request to an arbitrary host.
 * A URL that is not recognisably a `discover-stores` action yields nothing, the
 * same rule `pdp404Snippet` applies to its own sibling derivation.
 */

jest.mock('vscode', () => ({
    workspace: { getConfiguration: jest.fn() },
}));

import * as vscode from 'vscode';
import {
    deriveCredentialServiceUrl,
    selectCredentialService,
    selectDiscoveryService,
} from '@/features/eds/services/accsDiscoveryConfig';

const DISCOVER = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/discover-stores';
const CREDENTIALS =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/get-commerce-credentials';

/** Seed `demoBuilder.accsDiscovery.services` with the given entries. */
function seedServices(services: unknown[]): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(services),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('deriveCredentialServiceUrl', () => {
    it('swaps the action segment', () => {
        expect(deriveCredentialServiceUrl(DISCOVER)).toBe(CREDENTIALS);
    });

    it('tolerates a trailing slash', () => {
        expect(deriveCredentialServiceUrl(`${DISCOVER}/`)).toBe(CREDENTIALS);
    });

    it('drops any query string', () => {
        expect(deriveCredentialServiceUrl(`${DISCOVER}?org=x&site=y`)).toBe(CREDENTIALS);
    });

    // The guard that matters: a setting pointing somewhere else must not become
    // a credential request to that somewhere else.
    it.each([
        ['not a discover-stores action', 'https://evil.example.com/api/v1/web/x/steal'],
        ['action segment only resembles it', 'https://example.adobeioruntime.net/discover-stores-x'],
        ['not a URL at all', 'discover-stores'],
        ['empty', ''],
    ])('returns undefined when the URL is %s', (_label, url) => {
        expect(deriveCredentialServiceUrl(url)).toBeUndefined();
    });

    // CONTROL: the happy path still works, so the row above is not passing
    // because the function returns undefined for everything.
    it('CONTROL — still derives from a well-formed URL after the refusals', () => {
        expect(deriveCredentialServiceUrl(DISCOVER)).toBe(CREDENTIALS);
    });
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

    it('reports invalid-url for a non-https entry', () => {
        seedServices([{ orgName: 'A', serviceUrl: 'http://insecure.example.com/discover-stores' }]);

        expect(selectDiscoveryService()).toEqual({ ok: false, reason: 'invalid-url' });
    });
});

describe('selectCredentialService', () => {
    it('selects then derives, in one step', () => {
        seedServices([{ orgName: 'A', orgId: '111', serviceUrl: DISCOVER }]);

        expect(selectCredentialService('111')).toEqual({ ok: true, serviceUrl: CREDENTIALS });
    });

    it('carries the selection failure through unchanged', () => {
        seedServices([]);

        expect(selectCredentialService()).toEqual({ ok: false, reason: 'none-configured' });
    });

    // A configured service whose URL is valid https but not a discover-stores
    // action is a THIRD failure, distinct from both selection failures: something
    // is configured, and we still cannot build a credential request from it.
    it('reports not-derivable when the selected URL is not a discover-stores action', () => {
        seedServices([{ orgName: 'A', serviceUrl: 'https://example.com/something-else' }]);

        expect(selectCredentialService()).toEqual({ ok: false, reason: 'not-derivable' });
    });
});
