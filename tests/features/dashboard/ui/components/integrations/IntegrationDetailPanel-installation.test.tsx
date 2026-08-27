/**
 * IntegrationDetailPanel — the "Commerce install" row (AB-5).
 *
 * Split from IntegrationDetailPanel.test.tsx (615 lines); same convention:
 * Spectrum primitives mocked per-suite, real panel component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntegrationDetailPanel } from '@/features/dashboard/ui/components/integrations/IntegrationDetailPanel';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _q, ...props }: any) => (
        <button onClick={onPress} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, isQuiet: _q, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} {...props}>
            {children}
        </span>
    ),
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children }: any) => <ul data-testid="card-menu">{children}</ul>,
    Item: ({ children }: any) => <li>{children}</li>,
    Text: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@spectrum-icons/workflow/More', () => ({ __esModule: true, default: () => null }));
jest.mock('@spectrum-icons/workflow/Edit', () => ({ __esModule: true, default: () => null }));
jest.mock('@spectrum-icons/workflow/Close', () => ({ __esModule: true, default: () => null }));

function makeModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return {
        id: 'kit-app',
        isMesh: false,
        name: 'Kit App',
        kindLabel: 'Pre-built',
        sourceLine: 'adobe/commerce-integration-starter-kit',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        urlLabel: 'App URL',
        menuActions: [],
        canRename: false,
        ...overrides,
    };
}

function renderPanel(model: IntegrationCardModel | undefined): void {
    render(
        <IntegrationDetailPanel
            model={model}
            onClose={jest.fn()}
            onAction={jest.fn()}
            onRename={jest.fn(() => Promise.resolve(null))}
        />
    );
}

describe('IntegrationDetailPanel — Commerce install row', () => {
    it('renders no row when the model carries no install record', () => {
        renderPanel(makeModel());

        expect(screen.queryByText('Commerce install')).not.toBeInTheDocument();
    });

    it('renders label, detail, and timestamp when the record exists', () => {
        renderPanel(
            makeModel({
                installation: {
                    label: 'Installed',
                    detail: 'Already installed and current.',
                    at: '6/1/2026, 10:00:00 AM',
                    failed: false,
                },
            })
        );

        expect(screen.getByText('Commerce install')).toBeInTheDocument();
        expect(screen.getByText('Installed')).toBeInTheDocument();
        expect(screen.getByText('Already installed and current.')).toBeInTheDocument();
        expect(screen.getByText('6/1/2026, 10:00:00 AM')).toBeInTheDocument();
    });

    it('a failed install wears the error treatment', () => {
        renderPanel(
            makeModel({
                installation: { label: 'Not installed', failed: true },
            })
        );

        expect(screen.getByText('Not installed')).toHaveClass('integration-card-status--error');
    });
});
