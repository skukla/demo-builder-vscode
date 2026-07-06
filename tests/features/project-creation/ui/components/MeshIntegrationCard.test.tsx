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
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
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
    AdobeProjectField: (props: {
        onCreateFlow?: (name: string) => void;
        createError?: string;
        initialCreateName?: string;
    }) => (
        <div data-testid="project-field">
            Project Field
            {props.createError && <div data-testid="create-error">{props.createError}</div>}
            {props.initialCreateName && (
                <div data-testid="create-name">{props.initialCreateName}</div>
            )}
            {props.onCreateFlow && (
                <button
                    type="button"
                    data-testid="create-flow"
                    onClick={() => props.onCreateFlow?.('My Demo')}
                >
                    create
                </button>
            )}
        </div>
    ),
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
    const updateState = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <MeshIntegrationCard
                state={(overrides.state ?? {}) as WizardState}
                updateState={updateState}
                available={overrides.available ?? true}
                selected={overrides.selected ?? false}
                onToggle={onToggle}
            />
        </Provider>,
    );
    return { onToggle, updateState };
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

    it('project chosen, no workspace: card is the workspace picker alone (no rows yet)', () => {
        renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
            },
        });

        // While picking the workspace the card body IS the workspace picker — the
        // project ChosenRow (and its Change) is NOT shown yet; only the summary rows,
        // once both are committed, bring the rows back.
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.queryByText('Demo Project')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
    });

    it('fully configured: offers a collapse chevron, folding to the Project · Workspace summary', () => {
        renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Kukla Mesh' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Collapse API Mesh' }));

        expect(screen.getByText('Kukla Mesh · Stage')).toBeInTheDocument();
        // Config (the destination rows) is hidden while collapsed.
        expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
    });

    it('not offered until a workspace is committed', () => {
        renderCard({
            selected: true,
            state: { ...SIGNED_IN, adobeProject: { id: 'p1', name: 'proj', title: 'Kukla Mesh' } },
        });
        expect(screen.queryByRole('button', { name: /collapse api mesh/i })).not.toBeInTheDocument();
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

    it('Change on the project clears the project + workspace (back to the picker)', () => {
        const { updateState } = renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        // The first Change is the project's.
        fireEvent.click(screen.getAllByRole('button', { name: /change/i })[0]);

        expect(updateState).toHaveBeenCalledWith({
            adobeProject: undefined,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
    });

    it('Change on the workspace clears only the workspace (keeps the project)', () => {
        const { updateState } = renderCard({
            selected: true,
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        // The second Change is the workspace's.
        fireEvent.click(screen.getAllByRole('button', { name: /change/i })[1]);

        expect(updateState).toHaveBeenCalledWith({
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
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

    describe('creation phase flow (centered spinner)', () => {
        /** Per-message-type deferred router over mockRequest. */
        function deferredRouter() {
            const pending: Record<string, Array<(v: unknown) => void>> = {};
            mockRequest.mockImplementation(
                (type: string) =>
                    new Promise((resolve) => {
                        (pending[type] ??= []).push(resolve);
                    }),
            );
            return {
                resolve(type: string, value: unknown) {
                    const next = pending[type]?.shift();
                    if (!next) throw new Error(`no pending request for ${type}`);
                    next(value);
                },
                requestCount(type: string) {
                    return mockRequest.mock.calls.filter((c) => c[0] === type).length;
                },
            };
        }

        /** Stateful harness: updateState actually merges so commits re-render the card. */
        function StatefulCard({ initial }: { initial: Partial<WizardState> }) {
            const [state, setState] = React.useState(initial as WizardState);
            const updateState = React.useCallback(
                (u: Partial<WizardState>) => setState((s) => ({ ...s, ...u })),
                [],
            );
            return (
                <Provider theme={defaultTheme} colorScheme="light">
                    <MeshIntegrationCard
                        state={state}
                        updateState={updateState}
                        available
                        selected
                        onToggle={jest.fn()}
                    />
                </Provider>
            );
        }

        const CREATED = {
            success: true,
            data: { id: 'p-new', name: 'my-demo', title: 'My Demo', org_id: 'org-1' },
        };
        const WORKSPACES = {
            success: true,
            data: [{ id: 'ws-1', name: 'Stage', title: 'Stage' }],
        };
        const ENABLED = {
            success: true,
            data: {
                apis: [
                    { code: 'GraphQLServiceSDK', name: 'API Mesh' },
                    { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
                ],
            },
        };

        beforeEach(() => jest.clearAllMocks());

        async function startFlow() {
            const router = deferredRouter();
            render(<StatefulCard initial={{ ...SIGNED_IN }} />);
            fireEvent.click(screen.getByTestId('create-flow'));
            return router;
        }

        it('swaps the destination for the centered spinner with the creating message', async () => {
            await startFlow();

            expect(await screen.findByText('Creating project "My Demo"…')).toBeInTheDocument();
            expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        });

        it('progresses through the three phase messages and lands on the committed rows', async () => {
            const router = await startFlow();

            await act(async () => router.resolve('create-adobe-project', CREATED));
            expect(screen.getByText('Setting up workspace…')).toBeInTheDocument();

            await act(async () => router.resolve('get-workspaces', WORKSPACES));
            expect(screen.getByText('Enabling API access…')).toBeInTheDocument();
            // Each phase also shows a sub-message naming the concrete action.
            expect(
                screen.getByText('Subscribing to API Mesh and the I/O Management API'),
            ).toBeInTheDocument();

            await act(async () => router.resolve('ensure-mesh-api-subscribed', ENABLED));
            // Committed rows: project + workspace ChosenRows and the enable row.
            expect(screen.getByText('My Demo')).toBeInTheDocument();
            expect(screen.getByText('Stage')).toBeInTheDocument();
            // The row adopted the phase flow's result: joined API names, no second request.
            expect(screen.getByText('API Mesh · I/O Management API')).toBeInTheDocument();
            expect(router.requestCount('ensure-mesh-api-subscribed')).toBe(1);
        });

        it('enabling failure shows the centered error with Retry; Retry re-issues only the enable', async () => {
            const router = await startFlow();

            await act(async () => router.resolve('create-adobe-project', CREATED));
            await act(async () => router.resolve('get-workspaces', WORKSPACES));
            await act(async () =>
                router.resolve('ensure-mesh-api-subscribed', {
                    success: false,
                    error: 'boom',
                }),
            );

            expect(screen.getByText('boom')).toBeInTheDocument();
            const retry = screen.getByRole('button', { name: /retry/i });

            fireEvent.click(retry);
            expect(await screen.findByText('Enabling API access…')).toBeInTheDocument();
            expect(router.requestCount('create-adobe-project')).toBe(1);
            expect(router.requestCount('ensure-mesh-api-subscribed')).toBe(2);

            await act(async () => router.resolve('ensure-mesh-api-subscribed', ENABLED));
            expect(screen.getByText('API Mesh · I/O Management API')).toBeInTheDocument();
        });

        it('create failure returns to the form with the error and name preserved', async () => {
            const router = await startFlow();

            await act(async () =>
                router.resolve('create-adobe-project', {
                    success: false,
                    error: 'name taken',
                }),
            );

            expect(screen.getByTestId('project-field')).toBeInTheDocument();
            expect(screen.getByTestId('create-error')).toHaveTextContent('name taken');
            expect(screen.getByTestId('create-name')).toHaveTextContent('My Demo');
        });
    });
});
