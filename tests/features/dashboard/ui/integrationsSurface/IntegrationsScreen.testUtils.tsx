/**
 * Shared harness for the `IntegrationsScreen` suite family.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT — `jest.mock` hoists above the imports of
 * the module it appears in, not across modules.
 *
 * Extracted 2026-09-02. The single suite had reached 753 lines against a 750-line CI
 * limit, which had been failing on develop since 2026-08-31 without anyone noticing:
 * `npm run gate` does not run that check, it is a separate workflow.
 */

/**
 * IntegrationsScreen Tests (integrations surface)
 *
 * The screen owns the DATA — the two live push channels, card derivation, and
 * filtering — while IntegrationsGrid renders what it is handed (the same split
 * as ProjectsDashboard → ProjectsGrid). So the channel behaviour that used to be
 * pinned on the grid lives here now:
 *   - `appBuilderComponentStatusUpdate` — per-id in-flight status, incl. the
 *     update-borne rename label
 *   - `appBuilderComponentsSnapshot` — the fresh persisted map, which is what
 *     LANDS an added card and DROPS a removed one without a reload
 *
 * Plus the scaffolding this surface adopted from ProjectsDashboard: the three
 * render states, the header count, and filtering.
 */

import React from 'react';
import { act } from '@testing-library/react';
import type { AppBuilderComponentState } from '@/types/base';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => Promise.resolve({ success: true })),
    },
}));

// The page primitives have their own suites; stub them so this file tests the
// screen's own logic (states, counts, filtering, channels) rather than layout.
jest.mock('@/core/ui/components/layout/PageHeader', () => ({
    PageHeader: ({ title, subtitle, action }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <span data-testid="page-subtitle">{subtitle}</span>}
            {action}
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/PageLayout', () => ({
    PageLayout: ({ header, children }: any) => (
        <div data-testid="page-layout">
            {header}
            {children}
        </div>
    ),
}));

jest.mock('@/core/ui/components/navigation/SearchHeader', () => ({
    // Mirrors the real `showSearch: totalCount > searchThreshold` so the
    // threshold this screen passes is actually exercised. The mock used to
    // render the field unconditionally, which made the threshold untestable.
    SearchHeader: ({
        totalCount,
        filteredCount,
        onSearchQueryChange,
        onRefresh,
        searchThreshold,
        countTrailing,
    }: any) => (
        <div data-testid="search-header">
            <span data-testid="total-count">{totalCount}</span>
            <span data-testid="filtered-count">{filteredCount}</span>
            {totalCount > (searchThreshold ?? 5) && (
                <input
                    aria-label="Filter integrations"
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                />
            )}
            <button onClick={onRefresh}>refresh</button>
            {countTrailing}
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback/CtaEmptyState', () => ({
    // The empty state moved from StatusDisplay to the shared CtaEmptyState
    // (2026-08-22, matching the Projects first-run look); same testid so the
    // suite keeps asserting behaviour, not markup.
    CtaEmptyState: ({ title, actions }: any) => (
        <div data-testid="empty-state">
            {title}
            {actions?.map((a: any) => (
                <button key={a.label} onClick={a.onPress}>
                    {a.label}
                </button>
            ))}
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: any) => <div data-testid="loading">{message}</div>,
}));

jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, ...p }: any) => (
        <button onClick={onPress} {...p}>
            {children}
        </button>
    ),
    Flex: ({ children }: any) => <div>{children}</div>,
    // Added with the no-results message: a per-suite Spectrum mock exports only
    // what the tree rendered when it was written.
    Text: ({ children }: any) => <span>{children}</span>,
    View: ({ children }: any) => <div>{children}</div>,
    ProgressCircle: (p: any) => <div data-testid="spinner" aria-label={p['aria-label']} />,
}));

// The grid and add modal have their own suites; stub to keep this focused on
// WHAT the screen hands down.
jest.mock('@/features/dashboard/ui/components/integrations/IntegrationsGrid', () => ({
    IntegrationsGrid: ({ cards, onAddRequest }: any) => (
        <div data-testid="grid">
            {cards.map((c: any) => (
                <div key={c.id} data-testid={`card-${c.id}`}>
                    {c.name} · {c.statusLabel}
                </div>
            ))}
            <button onClick={onAddRequest}>grid-add</button>
        </div>
    ),
}));

// The adapter renders the WIZARD's real flow modal, which needs Spectrum
// internals this suite deliberately does not mock. Its own behaviour (the
// commit callbacks, the mesh rule, reservedIds) is pinned in
// AddIntegrationFlowAdapter.test.tsx.
// The Eventing section has its own suite (EventingSection.test.tsx); here it
// is a stub, same treatment as the grid — the screen's tests only care that it
// renders when the project has an Adobe context.
jest.mock('@/features/dashboard/ui/integrationsSurface/EventingSection', () => ({
    EventingSection: () => <div data-testid="eventing-section" />,
}));

jest.mock('@/features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter', () => ({
    // `mode` is surfaced so the destination-control suite can assert WHICH
    // journey opened — add vs destination is the whole point of that control.
    AddIntegrationFlowAdapter: ({ isOpen, mode }: any) =>
        isOpen ? <div data-testid="add-modal" data-mode={mode ?? 'add'} /> : null,
}));

// Deliberately below the jest.mock calls: babel-plugin-jest-hoist lifts them
// above every import, so the screen always loads against the mocks.
import { asDisplayName } from '@/core/utils/projectDisplayName';

// Re-exported so specs never import the subject directly: a spec's own import
// could execute before this module and bind to UNMOCKED collaborators.
export {
    formatDestination,
    IntegrationsScreen,
} from '@/features/dashboard/ui/integrationsSurface/IntegrationsScreen';
export { asDisplayName };

export function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock; onMessage: jest.Mock };
}

/**
 * Capture push subscriptions so tests can drive the live channels.
 *
 * Fans out to EVERY subscriber of a type, matching the real client
 * (`Map<type, Set<handler>>`). A single-handler map silently dropped the first
 * subscriber: both `useLiveAppBuilderComponents` and `useRowStatusOverrides`
 * listen on `appBuilderComponentsSnapshot`, so the later registration displaced
 * the map updater and snapshots stopped landing — in the TEST only, which is the
 * kind of mock drift that reads as a product bug.
 */
export function captureHandlers(): Map<string, (data: unknown) => void> {
    const subscribers = new Map<string, Array<(data: unknown) => void>>();
    getClient().onMessage.mockImplementation((type: string, handler: (d: unknown) => void) => {
        const list = subscribers.get(type) ?? [];
        list.push(handler);
        subscribers.set(type, list);
        return jest.fn();
    });
    // Present the same Map-like read the tests already use, but dispatching to all.
    return {
        get: (type: string) => (data: unknown) =>
            subscribers.get(type)?.forEach((handler) => handler(data)),
    } as unknown as Map<string, (data: unknown) => void>;
}

/** Resolve the status gate so the screen leaves its loading state. */
export function settleStatus(handlers: Map<string, (data: unknown) => void>) {
    act(() => {
        handlers.get('statusUpdate')?.({ name: 'p', path: '/p', status: 'ready' });
    });
}

export const DEPLOYED: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'erp-sync' },
};


export function resetIntegrationsScreenMocks(): void {
    jest.clearAllMocks();
    getClient().onMessage.mockImplementation(() => jest.fn());
}
