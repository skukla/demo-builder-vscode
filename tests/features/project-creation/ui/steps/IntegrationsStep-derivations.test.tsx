/**
 * IntegrationsStep — what the surface RE-DERIVES, and the rules it applies to a rename.
 *
 * Everything this step shows is memoised off wizard state: the stack, the package, the
 * catalog entries those two select, the rows, and the card list. A memo that stops
 * recomputing keeps showing a choice the SC has already changed, which is invisible on
 * a single render and is exactly what these tests move.
 *
 * Graybox, like its sibling suite: the integration-flow module and useProjectBuilder are
 * REAL; only module-external boundaries are mocked. The `jest.mock` preamble is repeated
 * here rather than shared, because a `jest.mock` only hoists above the imports of its
 * own file.
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
    areaView,
    baseState,
    destinationLine,
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

describe('IntegrationsStep — re-deriving from the catalog', () => {
    it('drops every row when the stack moves to one the catalog does not carry', async () => {
        // Both lookups hang off the stack — the mesh entry and the integration
        // entries — so this moves them together.
        const configured = { selectedAppBuilderComponents: [MESH_ID, 'cat-reco'] };
        const { rerenderWith } = await renderStep(baseState(configured));
        expect(screen.getByText(MESH_NAME)).toBeInTheDocument();
        expect(screen.getByText('Recommendations')).toBeInTheDocument();

        await rerenderWith(baseState({ ...configured, selectedStack: 'retired-stack' }));

        expect(screen.queryByText(MESH_NAME)).not.toBeInTheDocument();
        expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
        expect(screen.getByText('No integrations yet.')).toBeInTheDocument();
    });

    it('drops a catalog row when the package moves to one the catalog does not carry', async () => {
        const { rerenderWith } = await renderStep(
            baseState({ selectedAppBuilderComponents: ['cat-reco'] })
        );
        expect(screen.getByText('Recommendations')).toBeInTheDocument();

        await rerenderWith(
            baseState({ selectedAppBuilderComponents: ['cat-reco'], selectedPackage: 'retired' })
        );

        expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
        expect(screen.getByText('No integrations yet.')).toBeInTheDocument();
    });
});

describe('IntegrationsStep — the pre-built gallery excludes the blank starter', () => {
    it('offers the catalog integrations and NOT the "Build custom" template', async () => {
        await renderStep(baseState());
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');

        await press(within(dialog).getByRole('button', { name: /Pre-built integration/ }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));

        const offered = Array.from(dialog.querySelectorAll('.choice-card-name')).map(
            (el) => el.textContent
        );
        // The blank starter is the "Build custom" template, not a pre-built option,
        // and a mesh-kind entry is a different kind entirely — neither belongs here.
        expect(offered).toContain('Recommendations');
        expect(offered).not.toContain('Custom Integration');
        expect(offered).not.toContain('Catalog Mesh');
    });

    it('offers nothing at all once the package leaves the catalog', async () => {
        const { rerenderWith } = await renderStep(baseState());
        await rerenderWith(baseState({ selectedPackage: 'retired' }));

        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        await press(within(dialog).getByRole('button', { name: /Pre-built integration/ }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));

        // With nothing to pick, the journey never opens a gallery at all — the kind
        // stage is still the one on screen.
        const offered = Array.from(dialog.querySelectorAll('.choice-card-name')).map(
            (el) => el.textContent
        );
        expect(offered).toEqual(['Pre-built integration', 'Build custom', 'Import a repo']);
    });

    it('commits a "Build custom" instance against the blank template repo', async () => {
        const { updateState } = await renderStep(baseState({ ...SIGNED_IN, ...COMMITTED_DEST }));
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');

        await press(within(dialog).getByRole('button', { name: /Build custom/ }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));
        await change(within(dialog).getByLabelText(/Name \(optional\)/), 'My Widget');

        // Walk the rest of the journey to its terminal stage, whatever length it is.
        for (let step = 0; step < 4; step += 1) {
            const next = within(dialog).queryByRole('button', { name: 'Continue' });
            if (!next) break;
            await press(next);
        }
        await press(within(dialog).getByRole('button', { name: 'Add Integration' }));

        const sourceWrite = updateState.mock.calls
            .map((c) => c[0])
            .filter((u) => u && 'appBuilderComponentSources' in u)
            .pop();
        expect(sourceWrite).toBeDefined();
        const sources = sourceWrite.appBuilderComponentSources as Record<
            string,
            { owner: string; repo: string; name?: string }
        >;
        const written = Object.values(sources)[0];
        expect(written.name).toBe('My Widget');
        expect(written.repo).toBeTruthy();
    });
});

describe('IntegrationsStep — the results shell', () => {
    it('marks the view empty and prints no destination when nothing is configured', async () => {
        await renderStep(baseState());

        expect(areaView()).toHaveClass('int-results--empty');
        expect(destinationLine()).toBeNull();
    });

    it('drops the empty modifier and prints the destination once a row exists', async () => {
        await renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID] }));

        expect(areaView()).not.toHaveClass('int-results--empty');
        expect(document.querySelectorAll('.int-destination')).toHaveLength(1);
    });
});

describe('IntegrationsStep — the rename rules', () => {
    /** Two shell instances, so one can be renamed onto the other. */
    const TWO_INSTANCES: Partial<WizardState> = {
        selectedAppBuilderComponents: ['my-widget', 'other-widget'],
        appBuilderComponentSources: {
            'my-widget': { owner: 'skukla', repo: 'app-builder-shell', name: 'My Widget' },
            'other-widget': { owner: 'skukla', repo: 'app-builder-shell', name: 'Other Widget' },
        },
    };

    /** Start the card's inline rename, type a name, and commit it with Enter. */
    async function rename(cardName: string, typed: string) {
        const card = row(cardName);
        await press(within(card).getByRole('button', { name: /rename/i }));
        const input = await within(card).findByRole('textbox');
        await change(input, typed);
        fireEvent.keyDown(input, { key: 'Enter' });
        await settle();
        return card;
    }

    it('writes the typed name with its surrounding whitespace trimmed off', async () => {
        const { updateState } = await renderStep(
            baseState({ ...TWO_INSTANCES, ...SIGNED_IN, ...COMMITTED_DEST })
        );

        await rename('My Widget', '   Renamed Widget   ');

        const write = updateState.mock.calls
            .map((c) => c[0])
            .filter((u) => u && 'appBuilderComponentSources' in u)
            .pop();
        expect(write.appBuilderComponentSources['my-widget'].name).toBe('Renamed Widget');
    });

    it('refuses another row’s name even when the capitalisation differs', async () => {
        const { updateState } = await renderStep(
            baseState({ ...TWO_INSTANCES, ...SIGNED_IN, ...COMMITTED_DEST })
        );

        const card = await rename('My Widget', 'OTHER WIDGET');

        await waitFor(() =>
            expect(
                within(card).getByText('That name is already used by another integration.')
            ).toBeInTheDocument()
        );
        expect(
            updateState.mock.calls.map((c) => c[0]).filter((u) => u && 'appBuilderComponentSources' in u)
        ).toHaveLength(0);
    });

    it('accepts a capitalisation-only change to a row’s OWN name', async () => {
        const { updateState } = await renderStep(
            baseState({ ...TWO_INSTANCES, ...SIGNED_IN, ...COMMITTED_DEST })
        );

        await rename('My Widget', 'MY WIDGET');

        const write = updateState.mock.calls
            .map((c) => c[0])
            .filter((u) => u && 'appBuilderComponentSources' in u)
            .pop();
        expect(write.appBuilderComponentSources['my-widget'].name).toBe('MY WIDGET');
    });
});

describe('IntegrationsStep — the reserved-id domain a new instance is minted against', () => {
    /** The committed instance's source entry, whatever id it was minted under. */
    function mintedSource(updateState: jest.Mock) {
        const write = updateState.mock.calls
            .map((c) => c[0])
            .filter((u) => u && 'appBuilderComponentSources' in u)
            .pop();
        const sources = write.appBuilderComponentSources as Record<string, { name?: string }>;
        const [id, entry] = Object.entries(sources).pop() as [string, { name?: string }];
        return { id, name: entry.name };
    }

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
        return mintedSource(updateState);
    }

    it('steps around an id a stack-compatible CATALOG entry already owns', async () => {
        // 'Cat Reco' slugs to 'cat-reco', which is a catalog id for this stack. The
        // wrong-repo-clone guard: the executor looks the catalog up first, so an
        // instance minted onto that id would clone somebody else's repo.
        const { updateState } = await renderStep(baseState({ ...SIGNED_IN, ...COMMITTED_DEST }));

        const minted = await addCustomNamed(updateState, 'Cat Reco');

        expect(minted.id).toBe('cat-reco-2');
        expect(minted.name).toBe('Cat Reco 2');
    });

    it('steps around an id an already-selected integration owns', async () => {
        const { updateState } = await renderStep(
            baseState({
                ...SIGNED_IN,
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            })
        );

        const minted = await addCustomNamed(updateState, 'Acme Widget');

        expect(minted.id).toBe('acme-widget-2');
        expect(minted.name).toBe('Acme Widget 2');
    });
});

