/**
 * Shared harness for the IntegrationsGrid suites (integrations grid — Step 7).
 *
 * The grid's scenarios split across two spec files to stay under the 500-line
 * limit — IntegrationsGrid.test.tsx (composition + the live push channels) and
 * IntegrationsGrid-actions.test.tsx (drawer, dispatch, dialogs, rename, add) —
 * so every mock, fixture, and query helper lives here.
 *
 * This module owns the component import (the ProjectDashboardScreen.testUtils
 * precedent): the specs render through `renderGrid` and never import
 * IntegrationsGrid themselves, which guarantees the jest.mock calls below are
 * registered before the component module loads.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeshStatus, StatusDisplay } from '@/features/dashboard/ui/hooks/useDashboardStatus';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => Promise.resolve({ success: true })),
    },
}));

jest.mock('@adobe/react-spectrum', () => ({
    // Menu renders items EAGERLY (no popup): each Item becomes a button firing
    // the parent Menu's onAction with its key, so a card-menu pick is one click.
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children, onAction }: any) => (
        <ul data-testid="card-menu">
            {require('react').Children.map(children, (child: any) =>
                child ? (
                    <li>
                        <button onClick={() => onAction?.(child.key)}>{child.props.children}</button>
                    </li>
                ) : null
            )}
        </ul>
    ),
    Item: ({ children }: any) => <>{children}</>,
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Flex: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Heading: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    ActionButton: ({ children, onPress, isQuiet: _isQuiet, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, isQuiet, ...props }: any) => (
        <span role="link" tabIndex={0} data-quiet={isQuiet} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    TextField: ({ label, value, onChange, ...props }: any) => (
        <input
            aria-label={label}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            {...props}
        />
    ),
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
}));

jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-more" />,
}));

jest.mock('@spectrum-icons/workflow/Close', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-close" />,
}));

jest.mock('@spectrum-icons/workflow/Edit', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-edit" />,
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, closeLabel, children }: any) => (
        <div role="dialog" aria-label={title}>
            <h2>{title}</h2>
            {children}
            <button onClick={onClose}>{closeLabel ?? 'Close'}</button>
            {actionButtons.map((b: any, i: number) => (
                <button key={i} onClick={b.onPress} data-variant={b.variant} disabled={b.isDisabled}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

// The Manage-APIs modal has its own suite; a stub proves the GRID's
// single-shared-instance wiring (open-for-id / close).
jest.mock('@/features/dashboard/ui/components/ManageApisModal', () => ({
    ManageApisModal: ({ isOpen, componentName, componentId, onClose }: any) =>
        isOpen ? (
            <div data-testid="manage-apis-modal" data-component-id={componentId}>
                managing: {componentName}
                <button onClick={onClose}>close-manage-apis</button>
            </div>
        ) : null,
}));

// Deliberately below the jest.mock calls (the aiHandlers.testUtils precedent):
// babel-plugin-jest-hoist lifts them above every import, so the component
// module always loads against the mocks.
import { IntegrationsGrid } from '@/features/dashboard/ui/components/integrations/IntegrationsGrid';
import {
    buildIntegrationCards,
    deriveMeshCard,
} from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import {
    getIdentifiedMeshAppBuilderComponent,
    getMeshAppBuilderComponent,
    listAppBuilderComponents,
} from '@/features/app-builder/services/appBuilderComponentState';

export function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock; request: jest.Mock; onMessage: jest.Mock };
}

/** Capture onMessage subscriptions so tests can push live updates. */
export function captureMessageHandlers(): Map<string, (data: unknown) => void> {
    const handlers = new Map<string, (data: unknown) => void>();
    getClient().onMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
        handlers.set(type, handler);
        return jest.fn();
    });
    return handlers;
}

/** Per-test mock reset — call from each spec's beforeEach. */
export function resetGridMocks(): void {
    jest.clearAllMocks();
    getClient().onMessage.mockImplementation(() => jest.fn());
    getClient().request.mockResolvedValue({ success: true });
}

export const CATALOG: AppBuilderComponentCatalogEntry[] = [
    {
        id: 'erp-sync',
        name: 'ERP Sync',
        description: 'Sync ERP data',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp-sync' },
    },
    {
        id: 'commerce-paas-mesh',
        name: 'API Mesh',
        description: 'Commerce mesh',
        kind: 'mesh',
        source: { owner: 'acme', repo: 'mesh' },
    },
];

export const DEPLOYED_INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'custom-app' },
    url: 'https://custom-app.example.com',
};

export const MESH_DISPLAY: StatusDisplay = { color: 'green', text: 'Deployed' };

/**
 * A persisted mesh component. Key it the way a real project does — by COMPONENT
 * id (`eds-accs-mesh`), never by the card's `'mesh'` identity or a catalog id.
 */
export const MESH_COMPONENT: AppBuilderComponentState = {
    kind: 'mesh',
    status: 'deployed',
    source: { owner: 'adobe', repo: 'commerce-mesh' },
    endpoint: 'https://mesh.example.com/graphql',
};

/** Two deployed custom integrations (non-catalog ids ⇒ renamable). */
export function twoDeployed(): Record<string, AppBuilderComponentState> {
    return {
        'custom-app': { ...DEPLOYED_INTEGRATION },
        'other-app': { ...DEPLOYED_INTEGRATION, source: { owner: 'acme', repo: 'other-app' } },
    };
}

export interface RenderOptions {
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    withMesh?: boolean;
    /** Raw mesh status (only meaningful with withMesh). */
    meshStatus?: MeshStatus;
    /** Mesh status label — the card's statusLabel is ALWAYS statusDisplay.text. */
    meshStatusText?: string;
    isMeshActionDisabled?: boolean;
    onDeployMesh?: () => void;
    onReAuthenticate?: () => void;
    onAddRequest?: () => void;
}

/**
 * Derive the cards the way the SCREEN does, then hand them to the presentational
 * grid. Card derivation moved to IntegrationsScreen (the screen owns and filters
 * the data, the grid renders it), so this harness stands in for that half —
 * which keeps every existing grid test expressed in its original inputs
 * (appBuilderComponents + mesh props) rather than hand-built card models.
 */
export function renderGrid({
    appBuilderComponents = {},
    withMesh = false,
    meshStatus = 'deployed',
    meshStatusText = MESH_DISPLAY.text,
    isMeshActionDisabled = false,
    onDeployMesh = jest.fn(),
    onReAuthenticate = jest.fn(),
    onAddRequest = jest.fn(),
}: RenderOptions = {}) {
    const project = { appBuilderComponents } as never;
    const integrationCards = buildIntegrationCards(
        listAppBuilderComponents(project),
        {},
        CATALOG,
    );
    const cards = withMesh
        ? [
              deriveMeshCard(
                  { ...MESH_DISPLAY, text: meshStatusText },
                  meshStatus,
                  getMeshAppBuilderComponent(project),
                  isMeshActionDisabled,
                  // Same SINGLE resolver the screen uses — id and state from one
                  // lookup, so the harness cannot pass a mismatched pair the real
                  // screen could never produce.
                  getIdentifiedMeshAppBuilderComponent(project)?.id,
              ),
              ...integrationCards,
          ]
        : integrationCards;

    const result = render(
        <IntegrationsGrid
            cards={cards}
            onAddRequest={onAddRequest}
            onDeployMesh={onDeployMesh}
            onReAuthenticate={onReAuthenticate}
        />,
    );
    return { ...result, onDeployMesh, onReAuthenticate, onAddRequest };
}

/** The card tile for a given accessible name (`name, statusLabel`). */
export function card(name: string, statusLabel: string): HTMLElement {
    return screen.getByRole('button', { name: `${name}, ${statusLabel}` });
}

/**
 * Open a card's detail panel and return the panel element.
 *
 * The panel is a non-modal <aside> beside the grid (it replaced the viewport
 * drawer), so it is found by its accessible name, not by role="dialog" — that
 * role now belongs only to the genuinely modal dialogs this grid hosts.
 */
export async function openPanel(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
    statusLabel: string,
): Promise<HTMLElement> {
    await user.click(card(name, statusLabel));
    return screen.getByLabelText(`${name} details`);
}

export function setupUser() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}
