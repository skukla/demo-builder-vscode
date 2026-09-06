/**
 * useAutoStoreDetect Hook Tests
 *
 * The hook decides THREE things, and each is asserted here:
 *   1. whether the connection fields are complete enough to detect at all
 *      (`autoDetectKey`, including the keychain-held password case),
 *   2. what the discovery request carries (`fetchStores` arguments — a mock
 *      cannot see a malformed call, so the arguments are the assertion), and
 *   3. when it may fire (once per key, never while data exists or a fetch is
 *      in flight, always on an explicit `forceFetch`).
 *
 * For PaaS the admin username/password travel IN the request when the user just
 * typed them; on a saved project the password is in the keychain, which this
 * webview cannot read, so they are omitted and the host resolves them. ACCS
 * discovery carries no credentials.
 */

import { renderHook } from '@testing-library/react';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import {
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    ACCS_GRAPHQL_ENDPOINT,
} from '@/core/config/envVarKeys';
import { validateURL } from '@/core/validation/URLValidator';
import type { ComponentConfigs } from '@/types/webview';

// The SSRF guard is a collaborator here: most tests only need it to pass, but
// the arguments it receives and its refusal are both behaviour of this hook.
jest.mock('@/core/validation/URLValidator', () => ({
    validateURL: jest.fn(),
}));

const mockValidateURL = validateURL as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAAS_CONFIGS: ComponentConfigs = {
    'adobe-commerce': {
        [PAAS_URL]: 'https://store.example.com',
        [PAAS_ADMIN_USERNAME]: 'admin',
        [PAAS_ADMIN_PASSWORD]: 'fake-test-pw-not-a-secret',
    },
};

const ACCS_ENDPOINT = 'https://na1.api.commerce.adobe.com/tenant/graphql';

const ACCS_CONFIGS: ComponentConfigs = {
    accs: { [ACCS_GRAPHQL_ENDPOINT]: ACCS_ENDPOINT },
};

/** PaaS fields with the password left to the keychain (see secretFlags). */
const PAAS_CONFIGS_NO_PASSWORD: ComponentConfigs = {
    'adobe-commerce': {
        [PAAS_URL]: 'https://store.example.com',
        [PAAS_ADMIN_USERNAME]: 'admin',
    },
};

interface Props {
    configs: ComponentConfigs;
    orgId?: string;
    hasStoreData?: boolean;
    isFetching?: boolean;
    secretFlags?: Record<string, Record<string, boolean>>;
}

function renderAutoDetect(initialProps: Props, fetchStores = jest.fn()) {
    const view = renderHook(
        (props: Props) =>
            useAutoStoreDetect({
                configs: props.configs,
                orgId: props.orgId ?? 'org-123',
                fetchStores,
                hasStoreData: props.hasStoreData ?? false,
                isFetching: props.isFetching ?? false,
                secretFlags: props.secretFlags,
            }),
        { initialProps },
    );
    return { fetchStores, ...view };
}

/** The single set of params `fetchStores` was called with. */
function onlyCall(fetchStores: jest.Mock): Record<string, unknown> {
    expect(fetchStores).toHaveBeenCalledTimes(1);
    return fetchStores.mock.calls[0][0];
}

beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps implementations, and this project's config does not
    // reset them between tests — so a `throws` set by one SSRF test would
    // otherwise silence every test after it.
    mockValidateURL.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutoStoreDetect — when the fields are complete enough to detect', () => {
    it('keys ACCS detection by the graphql endpoint', () => {
        const { result } = renderAutoDetect({ configs: ACCS_CONFIGS });

        expect(result.current.autoDetectKey).toBe(`accs:${ACCS_ENDPOINT}`);
    });

    it('ignores an ACCS endpoint whose path is not a graphql one', () => {
        const { result, fetchStores } = renderAutoDetect({
            configs: { accs: { [ACCS_GRAPHQL_ENDPOINT]: 'https://na1.api.commerce.adobe.com/rest' } },
        });

        expect(result.current.autoDetectKey).toBeUndefined();
        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('keys PaaS detection by the store URL, never the username', () => {
        const { result } = renderAutoDetect({ configs: PAAS_CONFIGS });

        expect(result.current.autoDetectKey).toBe('paas:https://store.example.com');
        expect(result.current.autoDetectKey).not.toContain('admin');
    });

    it('detects nothing at all from empty configs', () => {
        const { result, fetchStores } = renderAutoDetect({ configs: {} });

        expect(result.current.autoDetectKey).toBeUndefined();
        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('needs the PaaS password: URL and username alone are not enough', () => {
        const { result, fetchStores } = renderAutoDetect({ configs: PAAS_CONFIGS_NO_PASSWORD });

        expect(result.current.autoDetectKey).toBeUndefined();
        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('needs the PaaS URL: credentials alone are not enough', () => {
        const { result, fetchStores } = renderAutoDetect({
            configs: {
                'adobe-commerce': {
                    [PAAS_ADMIN_USERNAME]: 'admin',
                    [PAAS_ADMIN_PASSWORD]: 'fake-test-pw-not-a-secret',
                },
            },
        });

        expect(result.current.autoDetectKey).toBeUndefined();
        expect(fetchStores).not.toHaveBeenCalled();
    });
});

describe('useAutoStoreDetect — a password held in the keychain', () => {
    const FLAGS_WITH_PASSWORD = { 'adobe-commerce': { [PAAS_ADMIN_PASSWORD]: true } };

    it('detects when secretFlags say the password exists, though its value is unreadable', () => {
        const { fetchStores } = renderAutoDetect({
            configs: PAAS_CONFIGS_NO_PASSWORD,
            secretFlags: FLAGS_WITH_PASSWORD,
        });

        const params = onlyCall(fetchStores);
        expect(params.backendType).toBe('paas');
        // A LONE username would reach the service as an empty password and 401,
        // so the pair is omitted whole and the host resolves it from the keychain.
        expect(params.username).toBeUndefined();
        expect(params.password).toBeUndefined();
    });

    it('finds the flag whichever component declares it', () => {
        const { fetchStores } = renderAutoDetect({
            configs: PAAS_CONFIGS_NO_PASSWORD,
            secretFlags: {
                mesh: { SOME_OTHER_SECRET: true },
                'adobe-commerce': { [PAAS_ADMIN_PASSWORD]: true },
            },
        });

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });

    it('does not detect when the flags carry no password', () => {
        const { result, fetchStores } = renderAutoDetect({
            configs: PAAS_CONFIGS_NO_PASSWORD,
            secretFlags: { 'adobe-commerce': { SOME_OTHER_SECRET: true } },
        });

        expect(result.current.autoDetectKey).toBeUndefined();
        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('treats a false flag as no password', () => {
        const { result, fetchStores } = renderAutoDetect({
            configs: PAAS_CONFIGS_NO_PASSWORD,
            secretFlags: { 'adobe-commerce': { [PAAS_ADMIN_PASSWORD]: false } },
        });

        expect(result.current.autoDetectKey).toBeUndefined();
        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('detects as soon as the flags arrive, with the configs unchanged', () => {
        const { fetchStores, rerender } = renderAutoDetect({ configs: PAAS_CONFIGS_NO_PASSWORD });
        expect(fetchStores).not.toHaveBeenCalled();

        // The SAME configs object — only the flags changed, which is exactly how
        // a converged project loads: fields first, secret inventory after.
        rerender({ configs: PAAS_CONFIGS_NO_PASSWORD, secretFlags: FLAGS_WITH_PASSWORD });

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });
});

describe('useAutoStoreDetect — the PaaS request', () => {
    it('sends the typed admin credentials', () => {
        const { fetchStores } = renderAutoDetect({ configs: PAAS_CONFIGS });

        expect(onlyCall(fetchStores)).toEqual({
            backendType: 'paas',
            baseUrl: 'https://store.example.com',
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });
    });

    it('sends the origin only — path dropped, port kept', () => {
        const { fetchStores } = renderAutoDetect({
            configs: {
                'adobe-commerce': {
                    ...PAAS_CONFIGS['adobe-commerce'],
                    [PAAS_URL]: 'https://store.example.com:8443/admin/dashboard',
                },
            },
        });

        expect(onlyCall(fetchStores).baseUrl).toBe('https://store.example.com:8443');
    });

    it('skips a URL that does not parse', () => {
        const { fetchStores } = renderAutoDetect({
            configs: {
                'adobe-commerce': { ...PAAS_CONFIGS['adobe-commerce'], [PAAS_URL]: 'not a url' },
            },
        });

        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('skips a non-http(s) scheme', () => {
        const { fetchStores } = renderAutoDetect({
            configs: {
                'adobe-commerce': {
                    ...PAAS_CONFIGS['adobe-commerce'],
                    [PAAS_URL]: 'ftp://store.example.com',
                },
            },
        });

        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('accepts plain http', () => {
        const { fetchStores } = renderAutoDetect({
            configs: {
                'adobe-commerce': {
                    ...PAAS_CONFIGS['adobe-commerce'],
                    [PAAS_URL]: 'http://store.example.com',
                },
            },
        });

        expect(onlyCall(fetchStores).baseUrl).toBe('http://store.example.com');
    });

    it('puts the origin through the SSRF guard, http and https only', () => {
        renderAutoDetect({ configs: PAAS_CONFIGS });

        expect(mockValidateURL).toHaveBeenCalledWith('https://store.example.com', [
            'http',
            'https',
        ]);
    });

    it('sends nothing when the SSRF guard refuses the origin', () => {
        mockValidateURL.mockImplementation(() => {
            throw new Error('private network');
        });

        const { fetchStores } = renderAutoDetect({ configs: PAAS_CONFIGS });

        expect(fetchStores).not.toHaveBeenCalled();
    });
});

describe('useAutoStoreDetect — the ACCS request', () => {
    it('sends the origin, the org and the endpoint, and no credentials', () => {
        const { fetchStores } = renderAutoDetect({
            configs: {
                accs: {
                    [ACCS_GRAPHQL_ENDPOINT]: 'https://na1.api.commerce.adobe.com:8443/t1/graphql',
                },
            },
        });

        expect(onlyCall(fetchStores)).toEqual({
            backendType: 'accs',
            baseUrl: 'https://na1.api.commerce.adobe.com:8443',
            orgId: 'org-123',
            accsGraphqlEndpoint: 'https://na1.api.commerce.adobe.com:8443/t1/graphql',
        });
    });

    it('skips a non-http(s) scheme', () => {
        const { fetchStores } = renderAutoDetect({
            configs: { accs: { [ACCS_GRAPHQL_ENDPOINT]: 'ftp://na1.api.commerce.adobe.com/graphql' } },
        });

        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('accepts plain http', () => {
        const { fetchStores } = renderAutoDetect({
            configs: {
                accs: { [ACCS_GRAPHQL_ENDPOINT]: 'http://na1.api.commerce.adobe.com/t1/graphql' },
            },
        });

        expect(onlyCall(fetchStores).baseUrl).toBe('http://na1.api.commerce.adobe.com');
    });

    it('puts the origin through the SSRF guard, http and https only', () => {
        renderAutoDetect({ configs: ACCS_CONFIGS });

        expect(mockValidateURL).toHaveBeenCalledWith('https://na1.api.commerce.adobe.com', [
            'http',
            'https',
        ]);
    });

    it('sends nothing when the SSRF guard refuses the origin', () => {
        mockValidateURL.mockImplementation(() => {
            throw new Error('private network');
        });

        const { fetchStores } = renderAutoDetect({ configs: ACCS_CONFIGS });

        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('sends the org that is current at the time of the request', () => {
        const { fetchStores, rerender, result } = renderAutoDetect({
            configs: ACCS_CONFIGS,
            orgId: 'org-before',
        });

        rerender({ configs: ACCS_CONFIGS, orgId: 'org-after' });
        fetchStores.mockClear();
        result.current.forceFetch();

        expect(fetchStores).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-after' }));
    });
});

describe('useAutoStoreDetect — when auto-detection may fire', () => {
    it('fires once per key, however often the configs object is rebuilt', () => {
        const { fetchStores, rerender } = renderAutoDetect({ configs: PAAS_CONFIGS });

        // A new object holding the same values — every keystroke elsewhere on the
        // step produces one, and none of them is a new store to detect.
        rerender({ configs: { 'adobe-commerce': { ...PAAS_CONFIGS['adobe-commerce'] } } });

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });

    it('does not fire when store data is already loaded', () => {
        const { fetchStores } = renderAutoDetect({ configs: PAAS_CONFIGS, hasStoreData: true });

        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('does not fire while a fetch is already in flight', () => {
        const { fetchStores } = renderAutoDetect({ configs: PAAS_CONFIGS, isFetching: true });

        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('fires when the fields become complete on a later render', () => {
        const { fetchStores, rerender } = renderAutoDetect({
            configs: PAAS_CONFIGS_NO_PASSWORD,
        });
        expect(fetchStores).not.toHaveBeenCalled();

        rerender({ configs: PAAS_CONFIGS });

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });
});

describe('useAutoStoreDetect — forceFetch', () => {
    it('re-sends the PaaS credentials', () => {
        const { result, fetchStores } = renderAutoDetect({ configs: PAAS_CONFIGS });
        fetchStores.mockClear();

        result.current.forceFetch();

        expect(fetchStores).toHaveBeenCalledWith(
            expect.objectContaining({ username: 'admin', password: 'fake-test-pw-not-a-secret' }),
        );
    });

    it('does nothing when there is nothing to detect', () => {
        const { result, fetchStores } = renderAutoDetect({ configs: {} });

        expect(() => result.current.forceFetch()).not.toThrow();
        expect(fetchStores).not.toHaveBeenCalled();
    });

    it('ignores the store-data guard the auto path respects', () => {
        const { result, fetchStores } = renderAutoDetect({
            configs: PAAS_CONFIGS,
            hasStoreData: true,
        });
        expect(fetchStores).not.toHaveBeenCalled();

        result.current.forceFetch();

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });

    it('picks up fields that only completed after the first render', () => {
        const { result, fetchStores, rerender } = renderAutoDetect({
            configs: PAAS_CONFIGS_NO_PASSWORD,
        });

        rerender({ configs: PAAS_CONFIGS });
        fetchStores.mockClear();
        result.current.forceFetch();

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });

    it('leaves the auto path settled, so a later render does not detect twice', () => {
        const { result, fetchStores, rerender } = renderAutoDetect({
            configs: PAAS_CONFIGS,
            hasStoreData: true,
        });

        result.current.forceFetch();
        rerender({ configs: PAAS_CONFIGS, hasStoreData: false });

        expect(fetchStores).toHaveBeenCalledTimes(1);
    });
});
