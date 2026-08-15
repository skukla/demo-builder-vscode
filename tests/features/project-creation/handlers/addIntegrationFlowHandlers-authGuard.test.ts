/**
 * addIntegrationFlowHandlers — the Adobe sign-in guard.
 *
 * REGRESSION (2026-08-04): opening Add Integration on a project whose token had
 * expired launched a BROWSER unannounced, mid-modal, while the destination stage
 * showed "Fetching projects…". The pause-and-prompt guard did exist, but it lived
 * in `appBuilderComponentHandlers.runGuards` — which runs on the ADD, after the
 * modal choices. The user saw the browser first and the in-app prompt afterwards.
 *
 * Mechanism: `handleGetProjects` fetched with no auth check, and
 * `adobeEntityFetcher.getProjects` is "SDK with CLI fallback" — a stale token
 * drops it to `aio console project list --json`, which triggers interactive
 * browser auth. The codebase already names this hazard (the P1 rule behind
 * `getOrganizationsSdkOnly`: the CLI path "can stall ~14.5s and trigger
 * interactive browser auth, which must never happen automatically"). That rule
 * was enforced on the dashboard's on-open probes and nowhere near this flow.
 *
 * These tests pin the ORDER — refuse before fetching — for every entity handler
 * the flow exposes, so no future addition to the map reintroduces the surprise.
 */

import { addIntegrationFlowHandlers } from '@/features/project-creation/handlers/addIntegrationFlowHandlers';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';

jest.mock('vscode');

const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
}));

const mockAuthService = { isAuthenticated: jest.fn() };
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn(() => mockAuthService) },
}));

/**
 * Every handler in the flow map that reaches Adobe through the entity fetcher.
 *
 * `getProjects`, `getWorkspaces` and the org read each carry a CLI fallback
 * (`adobeEntityFetcher` lines ~300/~471/~568), and the create/delete/select
 * handlers reach the same fetcher to resolve their target — so all of them can
 * open a browser on a stale token.
 */
const ENTITY_HANDLERS = [
    'get-projects',
    'select-project',
    'create-adobe-project',
    'delete-adobe-project',
    'get-workspaces',
    'select-workspace',
    'create-adobe-workspace',
] as const;

/**
 * Handlers that must NOT be guarded: they are how a signed-out user signs in.
 * Guarding these would deadlock the destination stage's own AdobeAuthStep.
 */
const AUTH_HANDLERS = ['check-auth', 'authenticate', 'switchOrg'] as const;

function createContext(): HandlerContext & { sendMessage: jest.Mock } {
    return {
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        authManager: {
            // If a guard is missing, the handler reaches these — the fetch that
            // drops to the CLI and opens a browser. They must never be called
            // while unauthenticated.
            getProjects: jest.fn().mockResolvedValue([]),
            // The P1 sibling: no CLI fallback, so a background read cannot open
            // a browser even with a stale token.
            getProjectsSdkOnly: jest.fn().mockResolvedValue([]),
            getWorkspacesSdkOnly: jest.fn().mockResolvedValue([]),
            getWorkspaces: jest.fn().mockResolvedValue([]),
            getCurrentOrganization: jest.fn().mockResolvedValue({ name: 'Org' }),
        },
        stateManager: { getCurrentProject: jest.fn().mockResolvedValue(undefined) },
    } as unknown as HandlerContext & { sendMessage: jest.Mock };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Adobe entity handlers refuse before fetching when sign-in is declined', () => {
    beforeEach(() => {
        // The user dismissed the pause-and-prompt.
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });
    });

    it.each(ENTITY_HANDLERS)('%s consults the sign-in guard', async (type) => {
        const context = createContext();
        // Calling through the union makes the payload param the intersection of
        // every handler's payload; the guard fires before any payload is read.
        await addIntegrationFlowHandlers[type](context, {} as never);

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledTimes(1);
    });

    // THE regression. Reaching the fetcher is what runs `aio console …` and
    // opens the browser, so "did we fetch" is the only assertion that
    // distinguishes the fixed code from the broken code.
    it('never reaches the project fetch (the call that shells out to aio)', async () => {
        const context = createContext();
        await addIntegrationFlowHandlers['get-projects'](context, {});

        expect(context.authManager?.getProjects).not.toHaveBeenCalled();
    });

    it('never reaches the workspace fetch', async () => {
        const context = createContext();
        await addIntegrationFlowHandlers['get-workspaces'](context, {});

        expect(context.authManager?.getWorkspaces).not.toHaveBeenCalled();
    });

    it('returns AUTH_REQUIRED so the picker offers Sign In rather than Retry', async () => {
        const context = createContext();
        const result = await addIntegrationFlowHandlers['get-projects'](context, {});

        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
    });

    // A guard that only RETURNS leaves the picker spinning forever: it resolves
    // on the inbound message, not on the handler's return value. Silence is the
    // failure mode this whole handler map exists to prevent.
    it('sends the refusal on the wire so the picker stops loading', async () => {
        const context = createContext();
        await addIntegrationFlowHandlers['get-projects'](context, {});

        const sent = context.sendMessage.mock.calls.find((c) => c[0] === 'get-projects');
        expect(sent).toBeDefined();
        expect(sent?.[1]).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    });
});

describe('when already signed in the guard is transparent', () => {
    it('passes through to the real handler', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        const context = createContext();

        await addIntegrationFlowHandlers['get-projects'](context, {});

        expect(context.authManager?.getProjects).toHaveBeenCalledTimes(1);
    });
});

// A background read the user did not ask for must neither prompt NOR shell out.
// Prompting is what the guard does for a destination picker, and it is right
// there; for `useWizardEffects` hydrating a project's display title it turns a
// cosmetic fetch into a modal at wizard startup. `quiet` opts a caller out of
// both halves: no prompt, and the SDK-only fetch so the CLI can never run.
describe('quiet reads neither prompt nor shell out', () => {
    it('does not consult the sign-in guard', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const context = createContext();

        await addIntegrationFlowHandlers['get-projects'](context, { quiet: true });

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });

    it('uses the SDK-only fetch, never the CLI-fallback one', async () => {
        const context = createContext();

        await addIntegrationFlowHandlers['get-projects'](context, { quiet: true });

        expect(context.authManager?.getProjectsSdkOnly).toHaveBeenCalledTimes(1);
        expect(context.authManager?.getProjects).not.toHaveBeenCalled();
    });

    it('still answers on the wire so the caller resolves', async () => {
        const context = createContext();

        await addIntegrationFlowHandlers['get-projects'](context, { quiet: true });

        expect(context.sendMessage.mock.calls.some((c) => c[0] === 'get-projects')).toBe(true);
    });

    it('leaves a normal (non-quiet) read on the guarded, CLI-capable path', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        const context = createContext();

        await addIntegrationFlowHandlers['get-projects'](context, {});

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledTimes(1);
        expect(context.authManager?.getProjects).toHaveBeenCalledTimes(1);
        expect(context.authManager?.getProjectsSdkOnly).not.toHaveBeenCalled();
    });
});

describe('the sign-in handlers themselves stay unguarded', () => {
    it.each(AUTH_HANDLERS)('%s does not consult the guard', async (type) => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const context = createContext();

        await addIntegrationFlowHandlers[type](context, {}).catch(() => undefined);

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });
});
