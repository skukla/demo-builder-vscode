/**
 * MeshIntegrationCard Tests
 *
 * The stateful API Mesh card for the Integrations "Services" screen: an IntegrationCard
 * that, when added, expands to host its Adobe I/O destination inline — a sign-in gate
 * (reused AdobeAuthStep) when signed out, then the project/workspace select-or-create
 * fields (reused AdobeEntityFields) with commit-and-collapse (one field open at a time;
 * a chosen field collapses to a ChosenRow with a quiet "Change").
 *
 * AdobeAuthStep + the entity fields are mocked to sentinels (they have their own suites).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { MeshIntegrationCard } from '@/features/project-creation/ui/components/MeshIntegrationCard';
import type { WizardState } from '@/types/webview';

const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
    },
}));
jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: () => <div data-testid="project-field">Project Field</div>,
    AdobeWorkspaceField: () => <div data-testid="workspace-field">Workspace Field</div>,
}));

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'],
};

function renderCard(overrides: {
    state?: Partial<WizardState>;
    available?: boolean;
    selected?: boolean;
    onToggle?: jest.Mock;
} = {}) {
    const onToggle = overrides.onToggle ?? jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <MeshIntegrationCard
                state={(overrides.state ?? {}) as WizardState}
                updateState={jest.fn()}
                available={overrides.available ?? true}
                selected={overrides.selected ?? false}
                onToggle={onToggle}
            />
        </Provider>,
    );
    return { onToggle };
}

describe('MeshIntegrationCard', () => {
    beforeEach(() => {
        // The enablement row auto-issues this request whenever a workspace is
        // committed. Default to a pending promise so the destination-focused
        // tests below don't trigger an unawaited post-render state update
        // (the enablement-row describe overrides this with a resolved value).
        mockRequest.mockReturnValue(new Promise(() => {}));
    });

    it('unselected: shows Add and no expanded config', () => {
        renderCard({ selected: false });

        expect(screen.getByText('API Mesh')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.queryByTestId('adobe-auth-step')).not.toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('N/A stack: shows the N/A label and no action/config', () => {
        renderCard({ available: false, selected: false });

        expect(screen.getByText(/N\/A for this architecture/i)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('selected + signed OUT: expands to the sign-in gate (no destination fields yet)', () => {
        renderCard({ selected: true, state: {} });

        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('selected + signed IN, no project: shows the project field (no workspace yet)', () => {
        renderCard({ selected: true, state: { ...SIGNED_IN } });

        expect(screen.queryByTestId('adobe-auth-step')).not.toBeInTheDocument();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
    });

    it('project chosen: collapses project to a ChosenRow and opens the workspace field', () => {
        renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
            },
        });

        // Project collapsed to a chosen row (value + Change), project field hidden.
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
        // Workspace field now open.
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
    });

    it('both chosen: both collapse to chosen rows (two Change controls)', () => {
        renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        expect(screen.getByText('Stage')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /change/i })).toHaveLength(2);
    });

    it('clicking Change on a chosen project reopens the project field', () => {
        renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        // The first Change is the project's.
        fireEvent.click(screen.getAllByRole('button', { name: /change/i })[0]);

        expect(screen.getByTestId('project-field')).toBeInTheDocument();
    });

    it('Remove fires onToggle(false)', () => {
        const { onToggle } = renderCard({ selected: true, state: { ...SIGNED_IN } });

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(onToggle).toHaveBeenCalledWith(false);
    });

    describe('API access enablement row', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            mockRequest.mockResolvedValue({ success: true });
        });

        it('is not rendered (and issues no request) until a workspace is committed', () => {
            renderCard({
                selected: true,
                state: {
                    ...SIGNED_IN,
                    adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                    selectedStack: 'eds-paas',
                },
            });

            expect(screen.queryByText('API access')).not.toBeInTheDocument();
            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('renders and issues the request with the payload derived from state + stack', async () => {
            renderCard({
                selected: true,
                state: {
                    ...SIGNED_IN,
                    adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                    adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
                    selectedStack: 'eds-paas',
                },
            });

            expect(screen.getByText('API access')).toBeInTheDocument();
            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith('ensure-mesh-api-subscribed', {
                    orgId: 'org-1',
                    projectId: 'p1',
                    workspaceId: 'w1',
                    backendId: 'adobe-commerce-paas',
                    frontendId: 'eds-storefront',
                });
            });
        });

        it('has no "Change" affordance on the enablement row', async () => {
            renderCard({
                selected: true,
                state: {
                    ...SIGNED_IN,
                    adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                    adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
                    selectedStack: 'eds-paas',
                },
            });

            // Let the auto-run resolve so we assert on the settled row.
            await waitFor(() => {
                expect(screen.getByText('Enabled')).toBeInTheDocument();
            });

            const row = screen.getByText('API access').closest('.int-chosen') as HTMLElement;
            expect(row).not.toBeNull();
            expect(
                within(row).queryByRole('button', { name: /change/i }),
            ).not.toBeInTheDocument();
        });
    });
});
