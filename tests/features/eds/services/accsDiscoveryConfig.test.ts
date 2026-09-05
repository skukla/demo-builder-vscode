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

/**
 * The cap `deriveCredentialServiceUrl` refuses past, mirrored here so the
 * boundary can be tested from both sides. If the module's own constant moves,
 * these fail — which is the point: the cap is a stated protection, not an
 * implementation detail.
 */
const MAX_SERVICE_URL_LENGTH = 2048;

/** A well-formed discover-stores URL of exactly `total` characters. */
function discoverUrlOfLength(total: number): string {
    const prefix = 'https://example.adobeioruntime.net/api/v1/web/';
    const suffix = '/discover-stores';
    return `${prefix}${'a'.repeat(total - prefix.length - suffix.length)}${suffix}`;
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

    /**
     * The length cap, from both sides.
     *
     * Everything past this point is parsed by `new URL` and pattern-matched, so
     * the cap is what stops a pathological setting value from being handed to
     * the parser at all. Testing only the over-cap side leaves the comparison
     * free to slide by one; testing only the under-cap side leaves the whole
     * guard deletable, because a long-but-valid URL derives perfectly well
     * without it.
     */
    it(`refuses a URL longer than ${MAX_SERVICE_URL_LENGTH} characters`, () => {
        const tooLong = discoverUrlOfLength(MAX_SERVICE_URL_LENGTH + 1);

        expect(tooLong).toHaveLength(MAX_SERVICE_URL_LENGTH + 1);
        expect(deriveCredentialServiceUrl(tooLong)).toBeUndefined();
    });

    it(`still derives from a URL of exactly ${MAX_SERVICE_URL_LENGTH} characters`, () => {
        const atCap = discoverUrlOfLength(MAX_SERVICE_URL_LENGTH);

        expect(atCap).toHaveLength(MAX_SERVICE_URL_LENGTH);
        expect(deriveCredentialServiceUrl(atCap)).toContain('/get-commerce-credentials');
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
