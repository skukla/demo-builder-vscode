/**
 * Shared preamble for the useProjectCreationPhases pair (base phase machine +
 * the recovery suite). The vscode-api mock, the per-type deferred router, the
 * fixtures and the two flow drivers were identical across both, so this file
 * owns them once and — per webview-test-authoring §3 — also owns the SUT
 * import, so neither spec binds the hook before the mock registers.
 */

import { renderHook, act } from '@testing-library/react';
import type { WizardState } from '@/types/webview';

export const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
    },
}));

export { useProjectCreationPhases } from '@/features/project-creation/ui/hooks/useProjectCreationPhases';
import { useProjectCreationPhases } from '@/features/project-creation/ui/hooks/useProjectCreationPhases';

/** A promise whose resolution we control (for phase-by-phase assertions). */
function deferred<T = unknown>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

type Deferred = ReturnType<typeof deferred>;

/** Routes each request type to a fresh deferred; exposes the latest per type. */
export function routeDeferred() {
    const byType = new Map<string, Deferred[]>();
    mockRequest.mockImplementation((type: string) => {
        const d = deferred();
        const list = byType.get(type) ?? [];
        list.push(d);
        byType.set(type, list);
        return d.promise;
    });
    return {
        latest(type: string): Deferred {
            const list = byType.get(type) ?? [];
            return list[list.length - 1];
        },
        count(type: string): number {
            return (byType.get(type) ?? []).length;
        },
    };
}

export const CREATED_PROJECT = {
    id: 'p-new',
    name: 'my-demo',
    title: 'My Demo',
    description: 'a demo',
    org_id: 'org-1',
};

export const STAGE_WS = { id: 'w-stage', name: 'Stage', title: 'Stage' };
export const PROD_WS = { id: 'w-prod', name: 'Production', title: 'Production' };

// 'eds-paas' resolves via the real stacks.json (same ids the card tests pin).
export const BASE_STATE = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' },
    selectedStack: 'eds-paas',
} as unknown as WizardState;

export function renderPhases(
    state: WizardState = BASE_STATE,
    options: { skipEnabling?: boolean } = {}
) {
    const updateState = jest.fn();
    const rendered = renderHook(() => useProjectCreationPhases({ state, updateState, ...options }));
    return { ...rendered, updateState };
}

/** Drives the flow up to (and including) a successful create resolution. */
export async function startAndCreate(
    route: ReturnType<typeof routeDeferred>,
    hook: ReturnType<typeof renderPhases>,
    name = 'My Demo'
) {
    await act(async () => {
        hook.result.current.start(name);
    });
    await act(async () => {
        route.latest('create-adobe-project').resolve({
            success: true,
            data: CREATED_PROJECT,
            projects: [CREATED_PROJECT],
        });
    });
}

/** Drives the flow through create + workspace pick (Stage among two). */
export async function startThroughWorkspace(
    route: ReturnType<typeof routeDeferred>,
    hook: ReturnType<typeof renderPhases>
) {
    await startAndCreate(route, hook);
    await act(async () => {
        route.latest('get-workspaces').resolve({ success: true, data: [PROD_WS, STAGE_WS] });
    });
}
