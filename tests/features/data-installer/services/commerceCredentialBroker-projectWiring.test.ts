/**
 * The two wiring functions: brokerForContext and resolveProjectCredentials.
 *
 * These exist because the SAME three arguments were assembled at five call
 * sites and got it wrong three times, each time silently. `stackBackend` is not
 * a persisted field — it is mapped from `componentSelections.backend` — and
 * forgetting it makes the dispatch match neither backend and answer
 * `unsupported-backend`, which every caller reports as "no usable Commerce
 * credentials". All three misses were found live, none by a test, because every
 * suite mocked the resolver and a mock cannot notice a missing dispatch field.
 *
 * So this suite asserts the ARGUMENT the resolver receives, which is the only
 * thing that would have caught any of them.
 */

// The resolver double belongs HERE, not in the shared harness: this suite is the
// only one that wants it, and a jest.mock only hoists above the imports of the
// module it appears in.
jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn(),
}));

import {
    CLIENT_ID,
    CLIENT_SECRET,
    OK_BODY,
    SERVICE_URL,
    brokerForContext,
    clearSharedCredentialCache,
    resolveProjectCredentials,
    respondWith,
    selectCredentialService,
    type CredentialSourceProject,
} from './commerceCredentialBroker.testUtils';
import {
    resolveCommerceCredentials,
    type CredentialResolution,
} from '@/features/data-installer/services/commerceCredentials';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import type { HandlerContext } from '@/types/handlers';

const mockedSelect = selectCredentialService as jest.MockedFunction<typeof selectCredentialService>;
const mockedResolve = resolveCommerceCredentials as jest.MockedFunction<
    typeof resolveCommerceCredentials
>;

/** A fetch stand-in serving the pair. */
const servingPair = (): jest.Mock => respondWith(OK_BODY);

/** A HandlerContext whose auth hands back a token. */
function contextWithAuth(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return createMockHandlerContext({
        authManager: {
            getTokenManager: () => ({
                inspectToken: jest.fn().mockResolvedValue({ token: 'ims-token' }),
            }),
        } as unknown as HandlerContext['authManager'],
        ...overrides,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    clearSharedCredentialCache();
    mockedSelect.mockReturnValue({ ok: true, serviceUrl: SERVICE_URL });
});

describe('brokerForContext', () => {
    // brokerForContext deliberately exposes NO fetch seam — that is the point of
    // it, four call sites assembling one broker the same way — so the stand-in
    // goes on the global. Nothing here reaches a network either way.
    const realFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = servingPair() as unknown as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    it('builds a broker that resolves with the context authentication service', async () => {
        const broker = brokerForContext(contextWithAuth(), {});

        await expect(broker()).resolves.toEqual({
            ok: true,
            credentials: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
        });
    });

    // The org decides WHICH service is asked, and a project resolving its
    // credential from a different service depending on which screen asked would
    // be invisible until it wrote to the wrong instance.
    it('carries the project org into service selection', async () => {
        const broker = brokerForContext(contextWithAuth(), {
            adobe: { organization: '285361' },
        });

        await broker();

        expect(mockedSelect).toHaveBeenCalledWith('285361');
    });

    // Most projects have no Adobe org at all; reading through the missing object
    // must not throw, it must select without one.
    it('selects without an org for a project that has none', async () => {
        const broker = brokerForContext(contextWithAuth(), {});

        await broker();

        expect(mockedSelect).toHaveBeenCalledWith(undefined);
    });

    it('reports unavailable when the context has no authentication service', async () => {
        const context = createMockHandlerContext({
            authManager: undefined as unknown as HandlerContext['authManager'],
        });

        await expect(brokerForContext(context, {})()).resolves.toEqual({
            ok: false,
            reason: 'unavailable',
        });
    });

    // The status lines reach the extension's debug channel. Asserted as reached
    // at all, never on their wording.
    it('routes its status lines to the context debug logger', async () => {
        const context = contextWithAuth();

        await brokerForContext(context, {})();

        expect(context.debugLogger.debug).toHaveBeenCalled();
    });
});

describe('resolveProjectCredentials', () => {
    const RESOLUTION: CredentialResolution = { ok: false, reason: 'unsupported-backend' };

    function project(over: Partial<CredentialSourceProject> = {}): CredentialSourceProject {
        return {
            componentSelections: { backend: 'adobe-commerce-paas' },
            componentConfigs: { 'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://x' } },
            path: '/projects/demo',
            ...over,
        };
    }

    /** The single argument object the resolver was handed. */
    async function resolvedWith(
        context: HandlerContext,
        p: CredentialSourceProject
    ): Promise<Record<string, unknown>> {
        mockedResolve.mockResolvedValue(RESOLUTION);
        await resolveProjectCredentials(context, p);
        return mockedResolve.mock.calls[0][0] as unknown as Record<string, unknown>;
    }

    it('returns what the resolver answered', async () => {
        mockedResolve.mockResolvedValue(RESOLUTION);

        await expect(resolveProjectCredentials(contextWithAuth(), project())).resolves.toEqual(
            RESOLUTION
        );
    });

    // THE field that was forgotten three times. It is mapped, not persisted.
    it('maps the selected backend onto stackBackend', async () => {
        const arg = await resolvedWith(contextWithAuth(), project());

        expect(arg.project).toMatchObject({ stackBackend: 'adobe-commerce-paas' });
    });

    // A project with no selections at all still has to produce a resolvable
    // shape rather than throwing on the way in.
    it('sends an empty backend when the project has no selections', async () => {
        const arg = await resolvedWith(
            contextWithAuth(),
            project({ componentSelections: undefined })
        );

        expect(arg.project).toMatchObject({ stackBackend: '' });
    });

    it('passes the project config map through unchanged', async () => {
        const p = project();
        const arg = await resolvedWith(contextWithAuth(), p);

        expect(arg.project).toMatchObject({ componentConfigs: p.componentConfigs });
    });

    it('falls back to an empty config map rather than undefined', async () => {
        const arg = await resolvedWith(contextWithAuth(), project({ componentConfigs: undefined }));

        expect((arg.project as { componentConfigs: unknown }).componentConfigs).toStrictEqual({});
    });

    // The path is the SecretStorage key's project segment: without it the
    // credential store is never consulted and a migrated secret resolves to
    // nothing, reported as "no usable credentials".
    it('threads the project path so a migrated secret is findable', async () => {
        const arg = await resolvedWith(contextWithAuth(), project());

        expect(arg.project).toMatchObject({ path: '/projects/demo' });
    });

    it('omits the path when the project has none', async () => {
        const arg = await resolvedWith(contextWithAuth(), project({ path: undefined }));

        expect(arg.project).not.toHaveProperty('path');
    });

    it('threads SecretStorage, the other half of that pair', async () => {
        const secrets = { get: jest.fn(), store: jest.fn() };
        const context = contextWithAuth({
            context: { secrets } as unknown as HandlerContext['context'],
        });

        const arg = await resolvedWith(context, project());

        expect(arg.secrets).toBe(secrets);
    });

    // Some call sites have no extension context at all. Reading through it must
    // not throw — the resolution simply degrades to config-only.
    it('omits secrets when there is no extension context', async () => {
        const context = contextWithAuth({
            context: undefined as unknown as HandlerContext['context'],
        });

        const arg = await resolvedWith(context, project());

        expect(arg).not.toHaveProperty('secrets');
    });

    it('hands the resolver a broker built for this same project', async () => {
        const arg = await resolvedWith(contextWithAuth(), project({ adobe: { organization: '77' } }));

        await (arg.broker as () => Promise<unknown>)();

        expect(mockedSelect).toHaveBeenCalledWith('77');
    });
});
