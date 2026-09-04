/**
 * IntegrationsStep — the modal it hosts, and acting on the rows it has NOW.
 *
 * Sibling of the derivations suite: the same graybox setup, aimed at the journey the
 * step opens rather than at what it derives. Everything here is a handler or a memo
 * that must read the CURRENT wizard state — a card that appeared on a later render,
 * a pick that changed since mount, a catalog id the stack only just gained.
 *
 * The `jest.mock` preamble is repeated rather than shared, because a `jest.mock` only
 * hoists above the imports of its own file.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { change, press, settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

// --- module-external mocks --------------------------------------------------
const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn() },
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
        onMessage: jest.fn(() => () => {}),
    },
}));

const phasesMock = jest.fn();
jest.mock('@/features/project-creation/ui/hooks/useProjectCreationPhases', () => ({
    useProjectCreationPhases: (...args: unknown[]) => phasesMock(...args),
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: () => <div data-testid="project-field">Project Field</div>,
    AdobeWorkspaceField: () => <div data-testid="workspace-field">Workspace Field</div>,
}));

// Append one integration entry to the real catalog so a catalog-kind integration
// resolves to a row (mesh resolution reads the SAME loader — never replace it).
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/components/services/appBuilderComponentCatalogLoader'
    );
    const reco = {
        id: 'cat-reco',
        name: 'Recommendations',
        description: 'Personalized product recommendations',
        kind: 'integration',
        requiredApis: ['AnalyticsSDK'],
        source: { owner: 'adobe', repo: 'reco', branch: 'main' },
    };
    // A mesh-kind entry on the same axes: the pre-built gallery must exclude it by
    // KIND, which is invisible in a catalog where every entry is an integration.
    const catMesh = {
        id: 'cat-mesh',
        name: 'Catalog Mesh',
        description: 'A mesh-kind catalog entry',
        kind: 'mesh',
        source: { owner: 'adobe', repo: 'cat-mesh', branch: 'main' },
    };
    return {
        ...actual,
        // Axis-filtered like the real loader: an empty backend or frontend selects
        // nothing, so a lost stack really does empty the catalog.
        getAvailableAppBuilderComponents: (backendId: string, frontendId: string) => [
            ...actual.getAvailableAppBuilderComponents(backendId, frontendId),
            ...(backendId && frontendId ? [reco, catMesh] : []),
        ],
    };
});

import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import type { WizardState } from '@/types/webview';
import {
    COMMITTED_DEST,
    MESH_ID,
    MESH_NAME,
    PACKAGES,
    SIGNED_IN,
    STACKS,
    baseState,
    row,
} from './IntegrationsStep.testUtils';

async function renderStep(state: WizardState, updateState = jest.fn()) {
    const ui = (next: WizardState) => (
        <Provider theme={defaultTheme}>
            <IntegrationsStep
                state={next}
                updateState={updateState}
                setCanProceed={jest.fn()}
                packages={PACKAGES}
                stacks={STACKS}
            />
        </Provider>
    );
    const view = render(ui(state));
    await settle();
    return {
        updateState,
        rerenderWith: async (next: WizardState) => {
            view.rerender(ui(next));
            await settle();
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ success: true, data: { apis: [] } });
    phasesMock.mockReturnValue({
        phase: 'idle',
        phaseMessage: undefined,
        phaseSubMessage: undefined,
        error: undefined,
        failedPhase: undefined,
        enableResult: undefined,
        projectName: '',
        start: jest.fn(),
        retry: jest.fn(),
        reset: jest.fn(),
    });
});

describe('IntegrationsStep — the modal it hosts', () => {
    it('closes on Cancel', async () => {
        await renderStep(baseState());
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await press(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('seeds the picker with the row’s CURRENT API picks in api-edit mode', async () => {
        mockRequest.mockImplementation((type: string) =>
            type === 'list-org-console-apis'
                ? Promise.resolve({
                      success: true,
                      data: {
                          apis: [
                              { code: 'AdobeAnalyticsSDK', name: 'Adobe Analytics', locked: false },
                              { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
                          ],
                      },
                  })
                : Promise.resolve({ success: true })
        );
        await renderStep(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
                selectedConsoleApis: { 'acme-widget': ['AdobeAnalyticsSDK'] },
            })
        );

        await press(row('widget'));
        const dialog = await screen.findByRole('dialog');
        await settle();

        expect(within(dialog).getByRole('checkbox', { name: /Adobe Analytics/ })).toBeChecked();
        expect(within(dialog).getByRole('checkbox', { name: /Adobe Campaign/ })).not.toBeChecked();
    });

    it('seeds nothing when the SAME surface then opens the add journey', async () => {
        mockRequest.mockImplementation((type: string) =>
            type === 'list-org-console-apis'
                ? Promise.resolve({
                      success: true,
                      data: {
                          apis: [
                              { code: 'AdobeAnalyticsSDK', name: 'Adobe Analytics', locked: false },
                          ],
                      },
                  })
                : Promise.resolve({ success: true })
        );
        await renderStep(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
                selectedConsoleApis: { 'acme-widget': ['AdobeAnalyticsSDK'] },
            })
        );

        // Open the picker for the row, close it, then start a fresh add.
        await press(row('widget'));
        await settle();
        await press(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        await press(within(dialog).getByRole('button', { name: /Build custom/ }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));
        await settle();

        // A fresh app starts with no picks — the previous row's must not carry over.
        expect(within(dialog).getByRole('checkbox', { name: /Adobe Analytics/ })).not.toBeChecked();
    });

    it('routes the picker’s sign-in through the WIZARD’s authenticate message', async () => {
        mockRequest.mockImplementation((type: string) =>
            type === 'list-org-console-apis'
                ? Promise.resolve({ success: false, code: 'AUTH_REQUIRED', error: 'Signed out' })
                : Promise.resolve({ success: true })
        );
        await renderStep(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            })
        );

        await press(row('widget'));
        const dialog = await screen.findByRole('dialog');
        await settle();
        await press(within(dialog).getByRole('button', { name: /Sign In with Adobe/ }));

        expect(mockRequest).toHaveBeenCalledWith('authenticate', { force: false });
    });
});

describe('IntegrationsStep — acting on the rows it has NOW', () => {
    const WIDGET: Partial<WizardState> = {
        selectedAppBuilderComponents: ['acme-widget'],
        appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
    };

    it('opens the picker for a card that only appeared on a later render', async () => {
        const { rerenderWith } = await renderStep(baseState({ ...SIGNED_IN, ...COMMITTED_DEST }));

        await rerenderWith(baseState({ ...SIGNED_IN, ...COMMITTED_DEST, ...WIDGET }));
        await press(row('widget'));

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Edit API Access' })
        ).toBeInTheDocument();
    });

    it('removes a mesh against the selection as it stands NOW', async () => {
        // The third integration arrives after mount. A remove routed through a
        // handler frozen at mount would write the OLD selection back and drop it.
        const { updateState, rerenderWith } = await renderStep(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget', MESH_ID],
                appBuilderComponentSources: WIDGET.appBuilderComponentSources,
            })
        );

        await rerenderWith(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget', MESH_ID, 'cat-reco'],
                appBuilderComponentSources: WIDGET.appBuilderComponentSources,
            })
        );
        await press(
            within(within(row(MESH_NAME)).getByRole('menu')).getByRole('menuitem', {
                name: /Remove/i,
            })
        );

        const write = updateState.mock.calls
            .map((c) => c[0])
            .filter((u) => u && 'selectedAppBuilderComponents' in u)
            .pop();
        expect(write.selectedAppBuilderComponents).toEqual(['acme-widget', 'cat-reco']);
    });

    it('seeds the picker from the picks as they stand NOW', async () => {
        mockRequest.mockImplementation((type: string) =>
            type === 'list-org-console-apis'
                ? Promise.resolve({
                      success: true,
                      data: {
                          apis: [
                              { code: 'AdobeAnalyticsSDK', name: 'Adobe Analytics', locked: false },
                              { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
                          ],
                      },
                  })
                : Promise.resolve({ success: true })
        );
        const withPicks = (picks: string[]) =>
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                ...WIDGET,
                selectedConsoleApis: { 'acme-widget': picks },
            });
        const { rerenderWith } = await renderStep(withPicks(['AdobeAnalyticsSDK']));

        await rerenderWith(withPicks(['CampaignSDK']));
        await press(row('widget'));
        const dialog = await screen.findByRole('dialog');
        await settle();

        expect(within(dialog).getByRole('checkbox', { name: /Adobe Campaign/ })).toBeChecked();
        expect(within(dialog).getByRole('checkbox', { name: /Adobe Analytics/ })).not.toBeChecked();
    });

    it('checks a rename against a row that only appeared on a later render', async () => {
        const INSTANCE = {
            selectedAppBuilderComponents: ['my-widget'],
            appBuilderComponentSources: {
                'my-widget': { owner: 'skukla', repo: 'app-builder-shell', name: 'My Widget' },
            },
        };
        const { updateState, rerenderWith } = await renderStep(
            baseState({ ...SIGNED_IN, ...COMMITTED_DEST, ...INSTANCE })
        );

        await rerenderWith(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['my-widget', 'late-widget'],
                appBuilderComponentSources: {
                    ...INSTANCE.appBuilderComponentSources,
                    'late-widget': {
                        owner: 'skukla',
                        repo: 'app-builder-shell',
                        // Stored padded, as a hand-edited manifest can be: the
                        // duplicate rule compares trimmed names, not raw ones.
                        name: '  Late Widget  ',
                    },
                },
            })
        );

        const card = row('My Widget');
        await press(within(card).getByRole('button', { name: /rename/i }));
        const input = await within(card).findByRole('textbox');
        await change(input, 'Late Widget');
        fireEvent.keyDown(input, { key: 'Enter' });
        await settle();

        await waitFor(() =>
            expect(
                within(card).getByText('That name is already used by another integration.')
            ).toBeInTheDocument()
        );
        expect(
            updateState.mock.calls.map((c) => c[0]).filter((u) => u && 'appBuilderComponentSources' in u)
        ).toHaveLength(0);
    });
});

describe('IntegrationsStep — minting against the catalog as it stands NOW', () => {
    /** Walk the Build-custom journey to its commit, returning the source write. */
    async function addCustomNamed(updateState: jest.Mock, label: string) {
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        await press(within(dialog).getByRole('button', { name: /Build custom/ }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));
        await change(within(dialog).getByLabelText(/Name \(optional\)/), label);
        for (let step = 0; step < 4; step += 1) {
            const next = within(dialog).queryByRole('button', { name: 'Continue' });
            if (!next) break;
            await press(next);
        }
        await press(within(dialog).getByRole('button', { name: 'Add Integration' }));
        return updateState.mock.calls
            .map((c) => c[0])
            .filter((u) => u && 'appBuilderComponentSources' in u)
            .pop();
    }

    it('reserves catalog ids the stack only gained on a later render', async () => {
        const { updateState, rerenderWith } = await renderStep(
            baseState({ ...SIGNED_IN, ...COMMITTED_DEST, selectedStack: 'no-such-stack' })
        );

        await rerenderWith(baseState({ ...SIGNED_IN, ...COMMITTED_DEST }));
        const write = await addCustomNamed(updateState, 'Cat Reco');

        expect(Object.keys(write.appBuilderComponentSources)).toEqual(['cat-reco-2']);
    });

    it('reserves an integration id that was selected on a later render', async () => {
        const { updateState, rerenderWith } = await renderStep(
            baseState({ ...SIGNED_IN, ...COMMITTED_DEST })
        );

        await rerenderWith(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            })
        );
        const write = await addCustomNamed(updateState, 'Acme Widget');

        expect(Object.keys(write.appBuilderComponentSources)).toContain('acme-widget-2');
    });

    it('commits nothing once the stack no longer supplies a template to clone', async () => {
        const { updateState, rerenderWith } = await renderStep(
            baseState({ ...SIGNED_IN, ...COMMITTED_DEST })
        );

        await rerenderWith(
            baseState({ ...SIGNED_IN, ...COMMITTED_DEST, selectedStack: 'no-such-stack' })
        );
        const write = await addCustomNamed(updateState, 'Orphan App');

        expect(write).toBeUndefined();
    });
});
