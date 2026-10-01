/**
 * IntegrationDetailPanel — the "Commerce install" row (AB-5).
 *
 * One line since 2026-10-01: the label and the installed version. A failed install adds
 * its reason and "Finish install"; the Admin link lives in the kebab. Split from
 * IntegrationDetailPanel.test.tsx (615 lines); same convention: Spectrum primitives
 * mocked per-suite, real panel component.
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

function renderPanel(model: IntegrationCardModel | undefined): {
    onAction: jest.Mock;
    installRow: () => HTMLElement;
    detailLines: () => string[];
} {
    const onAction = jest.fn();
    const view = render(
        <IntegrationDetailPanel
            model={model}
            onClose={jest.fn()}
            onOpenLinked={jest.fn()}
            onAction={onAction}
            onRename={jest.fn(() => Promise.resolve(null))}
        />
    );
    return {
        onAction,
        installRow: () =>
            screen.getByText('Commerce install').closest('.integration-panel-row') as HTMLElement,
        detailLines: () =>
            Array.from(view.container.querySelectorAll('.integration-panel-status-message')).map(
                (el) => el.textContent ?? ''
            ),
    };
}

describe('IntegrationDetailPanel — Commerce install row', () => {
    it('renders no row when the model carries no install record', () => {
        renderPanel(makeModel());

        expect(screen.queryByText('Commerce install')).not.toBeInTheDocument();
    });

    it('an installed app is ONE line: the label and its version', () => {
        const { installRow, detailLines } = renderPanel(
            makeModel({ installation: { label: 'Installed', version: '0.10.0', failed: false } })
        );

        expect(screen.getByText('Installed')).toBeInTheDocument();
        // The flex gap draws the space; textContent has none, so read the aside.
        expect(installRow().querySelector('.integration-panel-status-aside')).toHaveTextContent(
            '· v0.10.0'
        );
        expect(detailLines()).toStrictEqual([]);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('with no version known, the label stands alone', () => {
        const { installRow } = renderPanel(
            makeModel({ installation: { label: 'Installed', failed: false } })
        );

        expect(installRow()).toHaveTextContent(/^Commerce installInstalled$/);
    });

    // It was only in the kebab before, and the row read as a dead end (owner, 2026-10-01).
    it('a failed install adds its reason and "Finish install" — the idempotent install pass', () => {
        const model = makeModel({
            installation: { label: 'Not installed', detail: 'hands-back line', failed: true },
        });
        const { onAction, detailLines } = renderPanel(model);

        expect(detailLines()).toStrictEqual(['hands-back line']);
        screen.getByText('Finish install').click();

        expect(onAction).toHaveBeenCalledWith(model, 'install');
    });

    it('an installed app offers no "Finish install"', () => {
        renderPanel(makeModel({ installation: { label: 'Installed', failed: false } }));

        expect(screen.queryByText('Finish install')).not.toBeInTheDocument();
    });

    // The Admin is reached from the kebab's "Open Commerce Admin"; the row no longer
    // carries a second copy of it.
    it('carries no Admin link of its own', () => {
        renderPanel(makeModel({ installation: { label: 'Installed', failed: false } }));

        expect(screen.queryByText('Open Commerce Admin')).not.toBeInTheDocument();
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
