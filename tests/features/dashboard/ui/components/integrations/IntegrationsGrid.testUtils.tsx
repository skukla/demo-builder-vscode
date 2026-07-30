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
    ManageApisModal: ({ isOpen, componentName, onClose }: any) =>
        isOpen ? (
            <div data-testid="manage-apis-modal">
                managing: {componentName}
                <button onClick={onClose}>close-manage-apis</button>
            </div>
        ) : null,
}));

// Deliberately below the jest.mock calls (the aiHandlers.testUtils precedent):
// babel-plugin-jest-hoist lifts them above every import, so the component
// module always loads against the mocks.
import { IntegrationsGrid } from '@/features/dashboard/ui/components/integrations/IntegrationsGrid';

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
}

export function renderGrid({
    appBuilderComponents = {},
    withMesh = false,
    meshStatus = 'deployed',
    meshStatusText = MESH_DISPLAY.text,
    isMeshActionDisabled = false,
    onDeployMesh = jest.fn(),
    onReAuthenticate = jest.fn(),
}: RenderOptions = {}) {
    const result = render(
        <IntegrationsGrid
            appBuilderComponents={appBuilderComponents}
            catalog={CATALOG}
            meshStatusDisplay={withMesh ? { ...MESH_DISPLAY, text: meshStatusText } : null}
            meshStatus={withMesh ? meshStatus : undefined}
            isMeshActionDisabled={isMeshActionDisabled}
            onDeployMesh={onDeployMesh}
            onReAuthenticate={onReAuthenticate}
        />,
    );
    return { ...result, onDeployMesh, onReAuthenticate };
}

/** The card tile for a given accessible name (`name, statusLabel`). */
export function card(name: string, statusLabel: string): HTMLElement {
    return screen.getByRole('button', { name: `${name}, ${statusLabel}` });
}

/** Open a card's detail drawer and return the drawer element. */
export async function openDrawer(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
    statusLabel: string,
): Promise<HTMLElement> {
    await user.click(card(name, statusLabel));
    return screen.getByRole('dialog', { name: `${name} details` });
}

export function setupUser() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}
