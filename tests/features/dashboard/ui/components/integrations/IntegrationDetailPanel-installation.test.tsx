/**
 * IntegrationDetailPanel — the Commerce install, on the health line (AB-5).
 *
 * Since 2026-10-01 the install is part of the health line under the title: "Deployed ·
 * installed in Commerce" when all is well; a failed install adds its reason and "Finish
 * install" under it. The Admin link is in the Actions list; the version is gone from the
 * screen.
 * Split from
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
    unmount: () => void;
    healthLine: () => HTMLElement;
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
        unmount: view.unmount,
        healthLine: () =>
            view.container.querySelector('.integration-panel-health') as HTMLElement,
        detailLines: () =>
            Array.from(view.container.querySelectorAll('.integration-panel-status-message')).map(
                (el) => el.textContent ?? ''
            ),
    };
}

describe('IntegrationDetailPanel — the Commerce install on the health line', () => {
    it('says nothing about Commerce when the model carries no install record', () => {
        const { healthLine } = renderPanel(makeModel());

        expect(healthLine()).not.toHaveTextContent(/Commerce/);
        expect(screen.queryByText('Commerce install')).not.toBeInTheDocument();
    });

    it('an installed app is a tail on the health line, with no row and no version of its own', () => {
        const { healthLine, detailLines } = renderPanel(
            makeModel({ installation: { label: 'Installed', failed: false } })
        );

        expect(healthLine().querySelector('.integration-panel-status-aside')).toHaveTextContent(
            '(installed in Commerce)'
        );
        expect(screen.queryByText('Commerce install')).not.toBeInTheDocument();
        expect(detailLines()).toStrictEqual([]);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    // It was only in the kebab before, and the row read as a dead end (owner, 2026-10-01).
    it('a failed install adds its reason and "Finish install" — the idempotent install pass', () => {
        const model = makeModel({
            installation: { label: 'Not installed', detail: 'hands-back line', failed: true },
        });
        const { onAction, detailLines, healthLine } = renderPanel(model);

        expect(detailLines()).toStrictEqual(['hands-back line']);
        expect(healthLine().querySelector('.integration-panel-status-aside')).toBeNull();
        screen.getByText('Finish install').click();

        expect(onAction).toHaveBeenCalledWith(model, 'install');
    });

    // A refused upgrade: the install pass would meet the same refusal, so the line's fix is
    // the reinstall it names, not "Finish install" (audit, 2026-10-18).
    it('a refused upgrade offers the reinstall its reason names, not the install pass', () => {
        const model = makeModel({
            installation: { label: 'Not installed', detail: 'Reinstalling it applies the new version.', failed: true, needsReinstall: true },
        });
        const { onAction } = renderPanel(model);

        expect(screen.queryByText('Finish install')).not.toBeInTheDocument();
        screen.getByText('Reinstall in Commerce').click();

        expect(onAction).toHaveBeenCalledWith(model, 'reinstall');
    });

    it('a failed install with no reason still says what is wrong', () => {
        const { detailLines } = renderPanel(
            makeModel({ installation: { label: 'Not installed', failed: true } })
        );

        expect(detailLines()).toStrictEqual(['Not installed in Commerce']);
    });

    it('an installed app offers no "Finish install"', () => {
        renderPanel(makeModel({ installation: { label: 'Installed', failed: false } }));

        expect(screen.queryByText('Finish install')).not.toBeInTheDocument();
    });

    // The Admin is reached from the Actions list's "Open Commerce Admin"; the health line
    // carries no second copy of it.
    it('carries no Admin link of its own', () => {
        renderPanel(makeModel({ installation: { label: 'Installed', failed: false } }));

        expect(screen.queryByText('Open Commerce Admin')).not.toBeInTheDocument();
    });

    // AB-11: the listing's how-to and its warning moved to an optional step in the setup
    // guide, which names the real project and workspace (owner, 2026-10-18).
    it('has no App Management row: the setup guide carries it', () => {
        renderPanel(makeModel({ installation: { label: 'Installed', failed: false } }));

        expect(screen.queryByText('App Management')).not.toBeInTheDocument();
    });
});
