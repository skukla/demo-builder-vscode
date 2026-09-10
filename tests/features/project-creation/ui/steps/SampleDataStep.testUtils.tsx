/**
 * Shared preamble for the SampleDataStep suites (the base one and -choosing).
 *
 * It owns the module-external mocks and — per webview-test-authoring §3 — the
 * SUT import too, so neither spec binds the component before the mocks register.
 * `setMockState` is how a spec chooses which frame of the request it renders.
 *
 * SampleDataStep — the Commerce sub-step that records a datapack choice.
 *
 * The contract worth pinning is what it does NOT do: it must never start an
 * import. An import needs a reachable instance with working credentials and
 * runs for minutes; a failure inside project creation would leave a
 * half-populated instance the wizard has no story for. So it writes the choice
 * to wizard state and the dashboard installs it later.
 *
 * **It shows the panel's own grid.** A pack is a demo — brand art, a version, a
 * count of what it carries — and the Data Installer already presents it that
 * way. A flat list of names asks the user to pick a demo they cannot see, so the
 * step reuses `DatapackCard` rather than growing a second, poorer catalog. What
 * it does not reuse is the flyout: opening detail needs `get-datapack-detail`
 * registered too, and the wizard keeps its handler surface at the one read it
 * needs. Here a card press CHOOSES.
 *
 * **The mock returns the ENVELOPE, and that is load-bearing.** A handler's reply
 * reaches the webview whole — `{success, data, error}` — because the
 * communication manager sends the entire `HandlerResponse` as the payload
 * (`webviewCommunicationManager.ts:383`). An earlier fixture here returned the
 * unwrapped page, so `data.items` read true in tests and `undefined` in the Dev
 * Host: the step rendered "None" and nothing else, every time, while eight green
 * tests said otherwise. Mocking the envelope makes the real unwrapping run.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';

export const mockExecute = jest.fn();
let mockState: { loading: boolean; error: Error | null; data: unknown } = {
    loading: false,
    error: null,
    data: null,
};

jest.mock('@/core/ui/hooks/useVSCodeRequest', () => ({
    useVSCodeRequest: (type: string) => {
        mockTypes.push(type);
        return { execute: mockExecute, reset: jest.fn(), ...mockState };
    },
}));

export const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: (...args: unknown[]) => mockPostMessage(...args) },
}));

/** A handler reply as it really arrives: the whole envelope, not the payload. */
export function envelope(data: unknown) {
    return { loading: false, error: null, data: { success: true, data } };
}

/** In flight: no envelope yet, which is what the first render really sees. */
export function pending() {
    return { loading: true, error: null, data: null };
}

/**
 * The very first frame: nothing loading, nothing loaded.
 *
 * `useVSCodeRequest` starts `loading` FALSE and the fetch is kicked off from a
 * useEffect, which React runs after the first paint. So this state is real and
 * every mount passes through it — `pending()` above is the frame AFTER.
 */
export function notYetAsked() {
    return { loading: false, error: null, data: null };
}

/**
 * A guard refusal — `success:false` with a reason. It does NOT reject.
 *
 * The `code` is what the shared failure renderer branches on; matching the
 * MESSAGE instead would break the moment the copy is reworded.
 */
export function refusal(message: string, code?: string) {
    return {
        loading: false,
        error: null,
        data: { success: false, error: message, ...(code !== undefined ? { code } : {}) },
    };
}

/** An unset `demoBuilder.dataInstaller.apiBaseUrl` — what every colleague has. */
export function notConfigured() {
    return {
        loading: false,
        error: null,
        data: {
            success: false,
            error: 'No Data Installer API URL is configured. Set demoBuilder.dataInstaller.apiBaseUrl.',
            code: 'INVALID_OPERATION',
        },
    };
}

export const mockTypes: string[] = [];

// Below the mock on purpose — see webview-test-authoring §3.
import { SampleDataStep } from '@/features/project-creation/ui/steps/SampleDataStep';
export { SampleDataStep };
import type { WizardState } from '@/types/webview';

/** Two names, three rows — so the grouping is actually exercised. */
export const CATALOG = {
    // The REAL DatapackSummary shape: identity is a nested `id: {name, version}`,
    // not flat fields. A flat fixture looks right and crashes groupDatapacks.
    items: [
        {
            id: { name: 'bodea', version: 'main' },
            displayName: 'Bodea',
            shared: true,
            dataTypes: [],
            art: {},
        },
        {
            id: { name: 'bodea', version: 'hold' },
            displayName: 'Bodea',
            shared: true,
            dataTypes: [],
            art: {},
        },
        {
            id: { name: 'citisignal_new', version: 'main' },
            displayName: 'CitiSignal',
            shared: true,
            dataTypes: [],
            art: {},
        },
    ],
    total: 3,
};

export function renderStep(state: Partial<WizardState> = {}) {
    const updateState = jest.fn();
    const view = render(
        <SampleDataStep
            state={state as WizardState}
            updateState={updateState}
            setCanProceed={jest.fn()}
        />
    );
    return { ...view, updateState };
}

/** The card for one pack, found by the name it displays. */
export function cardFor(displayName: string): HTMLElement {
    const card = screen
        .getAllByTestId('datapack-card')
        .find((candidate) => within(candidate).queryByText(displayName));
    if (!card) {
        throw new Error(`no datapack card for ${displayName}`);
    }
    return card;
}

/** Choose which frame of the request the next render sees. */
export function setMockState(next: { loading: boolean; error: Error | null; data: unknown }): void {
    mockState = next;
}

/** The per-test reset both suites run. */
export function resetDataInstallerMocks(): void {
    jest.clearAllMocks();
    // The real hook awaits `execute` and attaches `.catch` — a bare jest.fn()
    // returns undefined and blows up inside it. The mock has to be shaped like
    // the thing it stands in for.
    mockExecute.mockResolvedValue(undefined);
    mockTypes.length = 0;
    mockState = envelope(CATALOG);
}
