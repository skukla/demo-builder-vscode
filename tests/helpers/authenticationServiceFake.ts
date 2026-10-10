/**
 * The canonical AuthenticationService fake (ADR-016 § Fixtures and fakes).
 *
 * WHY IT EXISTS, and why now. On 2026-09-01 the HandlerContext casts were converted
 * to `createMockHandlerContext(...)` on the syntax tree, and 51 files then failed
 * `typecheck:tests`. The compiler named the reason and ranked it: the literals hold
 * PARTIAL FAKES OF COLLABORATORS, and `AuthenticationService` was the second-largest
 * blocker at 16 failures. `as unknown as HandlerContext` erased that; a typed
 * builder's overrides do not.
 *
 * So this is not a tidy-up. It is the thing 16 conversions are waiting on, chosen
 * by measurement rather than taste.
 *
 * COVERS THE WHOLE PUBLIC SURFACE — 12 methods since 2026-10-08, when thirty-six
 * pass-throughs left the class (decompose-god-file) — for the reason `stateManagerFake`
 * documents: a builder narrower than the need is one nobody adopts, and the
 * divergence it was meant to stop grows around it instead. That fake answered one
 * method, and 50 suites hand-rolled their own rather than use it.
 *
 * TYPED TO THE REAL CLASS, which is the point. `HandlerContext.authManager` is
 * `AuthenticationService` (handlers.ts:181), so `jest.Mocked<AuthenticationService>`
 * makes this file stop compiling the day the class gains a method — one failure, in
 * one place, instead of every hand-rolled partial quietly ceasing to resemble it.
 * The import is type-only: no runtime dependency on the service or on vscode.
 *
 * The method list is READ from the class, not remembered (ADR-016 rule 3): the two
 * `private` members are excluded, everything else is here.
 *
 * @see tests/helpers/stateManagerFake.ts — the same design, and the argument for it
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section B
 */

import {
    createMockAuthCacheManager,
    createMockEntityServices,
    createMockSDKClient,
    type EntityServiceOverrides,
    type MockEntityServices,
} from './adobeAuthUnitsFake';
import type { EntityServices } from '@/features/authentication/services/adobeEntityService';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';

const entitiesByFake = new WeakMap<object, MockEntityServices>();

/**
 * The entity services a fake from {@link createMockAuthenticationService} resolves
 * `getEntityServices()` to — read synchronously, so a test can stage an answer or
 * assert a call without awaiting anything.
 */
export function entityServicesOf(auth: object | undefined): MockEntityServices {
    const entities = auth && entitiesByFake.get(auth);
    if (!entities) {
        throw new Error('entityServicesOf: not a fake from createMockAuthenticationService');
    }
    return entities;
}

/**
 * An AuthenticationService whose every method is a jest mock.
 *
 * Defaults are the SIGNED-IN, nothing-configured shape: `isAuthenticated` resolves
 * true because a suite that cares about the signed-out path says so explicitly,
 * while a suite that does not care would otherwise fail on a guard it never meant
 * to exercise. Every list resolves empty and every getter resolves null, so a test
 * asserting "no organizations" needs no override either.
 *
 * The units it hands out are fakes too, and the SAME object on every call:
 * `getCacheManager()` (see {@link createMockAuthCacheManager}), `getEntityServices()`
 * (reach it with {@link entityServicesOf}) and `getSdkClient()`. The unit fakes
 * live in `adobeAuthUnitsFake.ts`, so this file fakes exactly the class's surface
 * (`tests/sop/fake-mirrors-subject.test.ts` reads it).
 *
 * @param overrides - methods to replace. Typed, so a member that is not on
 *   AuthenticationService fails `typecheck:tests` instead of silently faking a
 *   method the real object does not have.
 * @param units - methods to replace on the units it hands out: `entities` by owning
 *   unit, `cache` on the cache manager
 */
export function createMockAuthenticationService(
    overrides: Partial<jest.Mocked<AuthenticationService>> = {},
    units: {
        entities?: EntityServiceOverrides;
        cache?: Partial<jest.Mocked<AuthCacheManager>>;
    } = {}
): jest.Mocked<AuthenticationService> {
    const entities = createMockEntityServices(units.entities);
    const cacheManager = createMockAuthCacheManager(units.cache);
    const sdkClient = createMockSDKClient();
    const fake = {
        // --- the units ---
        getCacheManager: jest.fn().mockReturnValue(cacheManager),
        getEntityServices: jest.fn().mockResolvedValue(entities),
        getTokenManager: jest.fn(),
        getSdkClient: jest.fn().mockReturnValue(sdkClient),

        // --- session ---
        isAuthenticated: jest.fn().mockResolvedValue(true),
        login: jest.fn().mockResolvedValue(undefined),
        loginAndRestoreProjectContext: jest.fn().mockResolvedValue(undefined),
        logout: jest.fn().mockResolvedValue(undefined),
        getTokenStatus: jest.fn().mockResolvedValue({ isAuthenticated: true }),
        testDeveloperPermissions: jest.fn().mockResolvedValue(true),

        // --- kept for the structural interfaces (see the class) ---
        getOrganizations: jest.fn().mockResolvedValue([]),
        getProjects: jest.fn().mockResolvedValue([]),

        ...overrides,
    } as unknown as jest.Mocked<AuthenticationService>;
    entitiesByFake.set(fake, entities);
    return fake;
}

/**
 * Give a hand-rolled FLAT fake the two ways in that callers now use:
 * `getEntityServices()` resolves to units that are all the fake itself, and
 * `getCacheManager()` returns the fake. A method the fake carries then answers
 * whichever unit owns it. Which unit a caller reaches for is the compiler's to
 * check, not a fake's.
 *
 * Plain functions, not `jest.fn`, so the config's `resetMocks` cannot empty them.
 *
 * @param flat - the fake to extend (mutated and returned)
 */
export function poolUnits<T extends object>(flat: T): T {
    const pool = {
        orgReads: flat,
        projectReads: flat,
        workspaceReads: flat,
        credentials: flat,
        orgServices: flat,
        projectOps: flat,
        workspaceOps: flat,
        extensionPoints: flat,
        resolver: flat,
        selector: flat,
    } as unknown as EntityServices;
    return Object.assign(flat, {
        getEntityServices: async (): Promise<EntityServices> => pool,
        getCacheManager: (): T => flat,
    });
}
