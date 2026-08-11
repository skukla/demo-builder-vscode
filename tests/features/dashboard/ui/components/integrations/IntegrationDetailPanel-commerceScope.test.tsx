/**
 * The flyout's "Commerce scope" row — what the mesh is DEPLOYED against.
 *
 * A permanent row beside Destination, Endpoint and Last deploy, not a
 * stale-only diff: what scope the mesh serves is always true, and you should
 * not need a warning badge before the question becomes answerable.
 *
 * Split from IntegrationDetailPanel.test.tsx (615 lines, already over the
 * max-lines warn) rather than appended. The existing assertions there stay
 * untouched, which is what proves the row changed nothing about the other rows.
 *
 * Self-contained preamble rather than a shared .testUtils: the mocks here are
 * this suite's, and `jest.mock` hoists above the SUT import WITHIN one module —
 * the hoisting trap only bites across module boundaries.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntegrationDetailPanel } from '@/features/dashboard/ui/components/integrations/IntegrationDetailPanel';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _q, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, isQuiet, ...props }: any) => (
        <span role="link" tabIndex={0} data-quiet={isQuiet} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children, onAction }: any) => (
        <ul data-testid="card-menu">
            {require('react').Children.map(children, (child: any) =>
                child ? (
                    <li>
                        <button onClick={() => onAction?.(child.key)}>
                            {child.props.children}
                        </button>
                    </li>
                ) : null
            )}
        </ul>
    ),
    Item: ({ children }: any) => <>{children}</>,
    Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-more" />,
}));

jest.mock('@spectrum-icons/workflow/Edit', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-edit" />,
}));

jest.mock('@spectrum-icons/workflow/Close', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-close" />,
}));

const SCOPE = [
    { label: 'Website', code: 'citisignal' },
    { label: 'Store', code: 'citisignal_store' },
    { label: 'Store view', code: 'citisignal_us' },
];

function makeMeshModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return {
        id: 'mesh',
        isMesh: true,
        name: 'API Mesh',
        kindLabel: 'API Mesh',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://mesh.example.com/graphql',
        urlLabel: 'Endpoint',
        lastDeployed: '6/1/2026, 10:00:00 AM',
        menuActions: [],
        canRename: false,
        commerceScope: SCOPE,
        ...overrides,
    };
}

/** The one scope value cell, so name-and-code assertions read as one string. */
function scopeValues(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.integration-panel-scope-value')).map((el) =>
        (el.textContent ?? '').trim()
    );
}

function renderPanel(model: IntegrationCardModel) {
    return render(
        <IntegrationDetailPanel
            model={model}
            onClose={jest.fn()}
            onAction={jest.fn()}
            onRename={jest.fn(() => Promise.resolve(null))}
        />
    );
}

describe('IntegrationDetailPanel — Commerce scope row', () => {
    it('renders the row with all three sub-labelled codes', () => {
        renderPanel(makeMeshModel());

        expect(screen.getByText('Commerce scope')).toBeInTheDocument();
        expect(screen.getByText('Website')).toBeInTheDocument();
        expect(screen.getByText('citisignal')).toBeInTheDocument();
        expect(screen.getByText('Store')).toBeInTheDocument();
        expect(screen.getByText('citisignal_store')).toBeInTheDocument();
        expect(screen.getByText('Store view')).toBeInTheDocument();
        expect(screen.getByText('citisignal_us')).toBeInTheDocument();
    });

    it('shows the row on a STALE mesh, still showing the DEPLOYED scope', () => {
        // The badge says the mesh is behind; the row says what it is behind ON.
        // If the row appeared only when stale, it was built as a diff again.
        renderPanel(makeMeshModel({ status: 'stale', statusLabel: 'Update available' }));

        expect(screen.getByText('Commerce scope')).toBeInTheDocument();
        expect(screen.getByText('citisignal')).toBeInTheDocument();
    });

    it('omits the row when the deployed snapshot carries no codes', () => {
        // Every mesh deployed before this shipped. It must not look broken.
        renderPanel(makeMeshModel({ commerceScope: undefined }));

        expect(screen.queryByText('Commerce scope')).not.toBeInTheDocument();
    });

    it('renders only the parts that are present', () => {
        renderPanel(makeMeshModel({ commerceScope: [{ label: 'Website', code: 'citisignal' }] }));

        expect(screen.getByText('Website')).toBeInTheDocument();
        expect(screen.queryByText('Store view')).not.toBeInTheDocument();
    });

    it('never appears on a non-mesh integration card', () => {
        // Integrations have no Commerce scope. Guarded on `isMesh` in the panel,
        // so a stray field on an integration model cannot leak the row.
        renderPanel(
            makeMeshModel({
                id: 'custom-app',
                isMesh: false,
                name: 'Custom App',
                kindLabel: 'Imported repo',
                sourceLine: 'acme/custom-app',
                urlLabel: 'App URL',
                commerceScope: SCOPE,
            })
        );

        expect(screen.queryByText('Commerce scope')).not.toBeInTheDocument();
    });
});

describe('IntegrationDetailPanel — Commerce scope reads the way the picker did', () => {
    it('renders `Name (code)` when the name was captured', () => {
        // The name is what the user picked; the code is what is in the `.env` and
        // what they would grep for. Both earn their place in a DETAIL panel.
        const { container } = renderPanel(
            makeMeshModel({
                commerceScope: [
                    { label: 'Website', code: 'citisignal', name: 'CitiSignal' },
                    { label: 'Store', code: 'citisignal_store', name: 'CitiSignal Store' },
                ],
            })
        );

        expect(scopeValues(container)).toEqual([
            'CitiSignal (citisignal)',
            'CitiSignal Store (citisignal_store)',
        ]);
    });

    it('renders the bare code when no name was captured — no empty parentheses', () => {
        // A codes-only row is the CORRECT rendering for every project predating
        // name capture. It must not look broken, and "(unknown)" would.
        const { container } = renderPanel(
            makeMeshModel({ commerceScope: [{ label: 'Website', code: 'citisignal' }] })
        );

        expect(scopeValues(container)).toEqual(['citisignal']);
    });

    it('resolves each part independently — one named, two not', () => {
        const { container } = renderPanel(
            makeMeshModel({
                commerceScope: [
                    { label: 'Website', code: 'citisignal' },
                    { label: 'Store', code: 'citisignal_store' },
                    { label: 'Store view', code: 'citisignal_us', name: 'CitiSignal US' },
                ],
            })
        );

        expect(scopeValues(container)).toEqual([
            'citisignal',
            'citisignal_store',
            'CitiSignal US (citisignal_us)',
        ]);
    });

    it('keeps the code visually distinct from the name', () => {
        // The parenthesised code is muted so the name reads first. Asserted on
        // the class rather than computed style: jsdom loads no stylesheet.
        const { container } = renderPanel(
            makeMeshModel({
                commerceScope: [{ label: 'Website', code: 'citisignal', name: 'CitiSignal' }],
            })
        );

        const code = container.querySelector('.integration-panel-scope-code');
        expect(code).toHaveTextContent('(citisignal)');
    });

    it('wraps a long value rather than widening the drawer', () => {
        // The value column is ~264px; `overflow-wrap: anywhere` is what keeps a
        // long name-plus-code inside it. Pinned as a class so a restyle that
        // drops it fails here rather than in a screenshot.
        const { container } = renderPanel(
            makeMeshModel({
                commerceScope: [
                    {
                        label: 'Store',
                        code: 'citisignal_store_north_america',
                        name: 'CitiSignal Store North America',
                    },
                ],
            })
        );

        const value = container.querySelector('.integration-panel-scope-value');
        expect(value).toBeInTheDocument();
        expect(value).toHaveTextContent(
            'CitiSignal Store North America (citisignal_store_north_america)'
        );
    });
});
