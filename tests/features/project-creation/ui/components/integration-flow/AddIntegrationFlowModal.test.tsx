/**
 * AddIntegrationFlowModal Tests (Integrations flow redesign — Step 7)
 *
 * The one-modal journey shell: a DialogContainer host with a CONDITIONAL mount
 * (the Spectrum test mock renders dialogs eagerly), the shared core Modal whose
 * Back/Continue footer is driven ENTIRELY by useIntegrationFlow, and a stage
 * switch mapping the hook's stage to the stage bodies. Graybox: the stages and
 * the ApiAccessPicker render REAL — only module-external boundaries are mocked
 * (webviewClient, useProjectCreationPhases, AdobeAuthStep, AdobeEntityFields).
 *
 * Reset-on-open is the conditional mount itself: closing unmounts the journey,
 * reopening mounts a fresh hook (pinned by the reopen test).
 *
 * Mocks, fixtures, harness and helpers live in AddIntegrationFlowModal.testUtils
 * (shared with the later-and-variants suite) — import the SUT from there only.
 *
 */

import { screen, waitFor } from '@testing-library/react';

import { change } from '../../../../../helpers/reactSettle';
import {
    mockRequest,
    setPhases,
    ERP,
    COMMITTED_DEST,
    APIS,
    renderFlowModal,
    button,
    click,
    expectDisabled,
    expectEnabled,
    walkMeshToProject,
    type RenderOptions,
} from './AddIntegrationFlowModal.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** The blank starter app the "Build custom" kind instances from. */
const BLANK: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'Custom Integration',
    description: 'A minimal custom integration to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

/** A SEED: scaffolding offered beside "Blank" on the Build-custom stage. */
const SEED: AppBuilderComponentCatalogEntry = {
    id: 'commerce-starter-kit',
    name: 'Commerce Starter Kit',
    description: 'Scaffolding for a Commerce-integrated custom app',
    kind: 'integration',
    seed: true,
    source: { owner: 'adobe', repo: 'commerce-starter-kit', branch: 'main' },
};

/** The composed collision domain IntegrationsStep threads in (catalog + selections). */
const RESERVED_IDS = new Set([
    'app-builder-shell',
    'erp-sync',
    'crm-connect',
    'commerce-mesh',
    'existing-integration',
    'eds-storefront',
]);

/** This suite mounts the modal WITH the blank starter and its full id domain. */
function renderModal(options: Omit<RenderOptions, 'reservedIds' | 'blankComponent'> = {}) {
    return renderFlowModal({ blankComponent: BLANK, reservedIds: RESERVED_IDS, ...options });
}

beforeEach(() => {
    jest.clearAllMocks();
    setPhases();
    mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });
});

// --- tests -----------------------------------------------------------------------
describe('AddIntegrationFlowModal — host & shell', () => {
    it('renders nothing while closed (conditional mount under the eager dialog mock)', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
    });

    it('titles the add mode "Add Integration"', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Add Integration' })).toBeInTheDocument();
    });

    it('titles the destination mode "Deployment Destination" and skips the kind stage', () => {
        renderModal({ mode: 'destination' });
        expect(screen.getByRole('heading', { name: 'Deployment Destination' })).toBeInTheDocument();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Pre-built integration/ })
        ).not.toBeInTheDocument();
    });

    it('renders the Cancel / Back / Continue footer', () => {
        renderModal();
        expect(button('Cancel')).toBeInTheDocument();
        expect(button('Back')).toBeInTheDocument();
        expect(button('Continue')).toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — kind stage', () => {
    it('offers the mesh tile when the stack has an unadded mesh', () => {
        renderModal();
        expect(button(/API Mesh/)).toBeInTheDocument();
    });

    // Changed 2026-08-04: already-added DISABLES the tile rather than hiding it.
    // A vanished tile is ambiguous — it looks the same as a stack with no mesh at
    // all (the case immediately below, which still hides).
    it('disables the mesh tile, with a reason, when mesh is already selected', () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['commerce-mesh'] } });
        expect(screen.getByRole('button', { name: /API Mesh/ })).toBeDisabled();
        expect(screen.getByText('Already added — one per project')).toBeInTheDocument();
    });

    it('hides the mesh tile when the stack has no mesh component', () => {
        renderModal({ meshComponent: undefined });
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
    });

    it('disables Back and Continue at the unpicked kind stage; a pick enables Continue', async () => {
        renderModal();
        expectDisabled('Back');
        expectDisabled('Continue');
        await click(/Import a repo/);
        expectEnabled('Continue');
        expectDisabled('Back');
    });
});

describe('AddIntegrationFlowModal — full mesh walk (first add)', () => {
    it('walks kind → project → workspace (terminal), then commits on Add — no api-access step', async () => {
        const { builder, updateSpy, onClose } = renderModal();
        await walkMeshToProject();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        await click('pick-project');
        await click('Continue');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeProject: { id: 'p-picked', name: 'picked', title: 'Picked Project' },
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
        // dest-workspace is the TERMINAL stage for the deterministic mesh (no
        // api-access step): its footer button reads "Add Integration" and commits +
        // closes in a single press, which also commits the pending workspace.
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
        await click('pick-ws');
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expectEnabled('Add Integration');
        await click('Add Integration');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeWorkspace: { id: 'w-picked', name: 'Stage', title: 'Stage' },
        });
        // Add commits the mesh and closes in a SINGLE press — no subscribe (the APIs
        // are subscribed later, at the rebuild).
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('mesh later-add finishes on the KIND stage: no dest step, no api-access, no fetch', async () => {
        renderModal({ initial: COMMITTED_DEST });
        await click(/API Mesh/);
        // A committed destination is a context LINE, not a step, and the deterministic
        // mesh has no api-access — so picking the kind is the whole flow.
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'list-org-console-apis',
            expect.anything(),
            expect.anything()
        );
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expectEnabled('Add Integration');
    });

    it('a mesh finish writes no selectedConsoleApis and never subscribes', async () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        await click(/API Mesh/); // kind is terminal — dest is a line, mesh has no api-access
        expectEnabled('Add Integration');
        await click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ selectedConsoleApis: expect.anything() })
        );
    });

    it('Back from dest-project returns to the kind stage', async () => {
        renderModal();
        await walkMeshToProject();
        await click('Back');
        expect(button(/API Mesh/)).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — build custom (optional-name model)', () => {
    /** kind → source-blank (the starting-point + optional-name stage). */
    async function walkToBlankStage(): Promise<HTMLElement> {
        await click(/Build custom/);
        await click('Continue');
        return screen.getByLabelText(/Name \(optional\)/);
    }

    it('Continue is enabled immediately — the name never gates', async () => {
        renderModal({ initial: COMMITTED_DEST });
        const input = await walkToBlankStage();
        expectEnabled('Continue');
        // Typing does not introduce a gate either — no validation exists here.
        await change(input, 'App Builder Shell');
        expect(
            screen.queryByText('That name is already used by another part of this project.')
        ).not.toBeInTheDocument();
        expectEnabled('Continue');
    });

    it('an empty name commits the minted DEFAULT instance ("Custom Integration")', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        await walkToBlankStage();
        await click('Continue');
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());
        await click('Add Integration');
        await waitFor(() =>
            expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
                { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                { id: 'custom-integration', name: 'Custom Integration' }
            )
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('walks kind → source-blank → api-access and commits the typed name', async () => {
        const { builder, updateSpy, onClose } = renderModal({ initial: COMMITTED_DEST });
        const input = await walkToBlankStage();
        await change(input, 'Firefly Image Gen');
        // Straight to api-access: the committed destination rides along as the
        // context line instead of costing a step.
        await click('Continue');
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());
        await click('Add Integration');
        // The commit routes through the custom add with the MINTED identity —
        // never the fixed-id toggle (which capped a project at one shell).
        await waitFor(() =>
            expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
                { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                { id: 'firefly-image-gen', name: 'Firefly Image Gen' }
            )
        );
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({
                selectedConsoleApis: expect.objectContaining({
                    'app-builder-shell': expect.anything(),
                }),
            })
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('offers SEEDS as starting points and keeps pre-built entries out of the row', async () => {
        // The two rows are drawn from the same catalog by opposite predicates. A
        // seed belongs here and nowhere else; a finished pre-built integration
        // belongs in the gallery and must not be offered as a starting point.
        renderModal({ initial: COMMITTED_DEST, catalog: [ERP, SEED] });
        await walkToBlankStage();

        expect(screen.getByText(SEED.name)).toBeInTheDocument();
        expect(screen.queryByText(ERP.name)).not.toBeInTheDocument();
    });

    it('picks up a seed from a catalog that arrives after the stage is on screen', async () => {
        // The catalog loads asynchronously, so it can land while the modal is
        // already open. The derived rows have to follow it.
        const { setCatalog } = renderModal({ initial: COMMITTED_DEST, catalog: [ERP] });
        await walkToBlankStage();
        expect(screen.queryByText(SEED.name)).not.toBeInTheDocument();

        setCatalog([ERP, SEED]);

        expect(screen.getByText(SEED.name)).toBeInTheDocument();
    });
});

/**
 * Reported 2026-08-06: "Pre-built integrations" listed two options on a catalog with
 * no pre-built integrations. Both were entries the kind picker already offers as
 * their own card — the derived mesh as "API Mesh", the blank shell as "Build
 * custom" — because the modal passed the raw stack-filtered catalog to both the
 * tile count and the gallery.
 *
 * The correct empty state already existed ("None available yet", tile disabled at
 * count 0). It simply never fired.
 */
describe('AddIntegrationFlowModal — only genuine pre-built entries reach the gallery', () => {
    /**
     * The mesh as it appears in the CATALOG (derived from stacks.json), not as the
     * SelectableAppBuilderComponent the MESH fixture above models.
     */
    const MESH_ENTRY: AppBuilderComponentCatalogEntry = {
        id: 'commerce-mesh',
        name: 'API Mesh',
        description: 'Mesh for the stack',
        kind: 'mesh',
        source: { owner: 'adobe', repo: 'commerce-mesh', branch: 'main' },
    };

    /** A stack's real catalog: one derived mesh + the blank shell. No pre-builts. */
    const MIXED = [MESH_ENTRY, BLANK];

    it('disables the Pre-built tile when the catalog holds only a mesh and the shell', () => {
        renderModal({ catalog: MIXED });

        expect(screen.getByRole('button', { name: /Pre-built/ })).toBeDisabled();
    });

    it('counts a genuine authored integration', () => {
        renderModal({ catalog: [MESH_ENTRY, BLANK, ERP] });

        expect(screen.getByRole('button', { name: /Pre-built/ })).not.toBeDisabled();
    });

    it('enables the Pre-built tile when a real integration arrives in a later catalog', () => {
        const { setCatalog } = renderModal({ catalog: MIXED });
        expect(screen.getByRole('button', { name: /Pre-built/ })).toBeDisabled();

        setCatalog([MESH_ENTRY, BLANK, ERP]);

        expect(screen.getByRole('button', { name: /Pre-built/ })).not.toBeDisabled();
    });

    it('keeps the mesh and the shell OUT of the gallery', async () => {
        // Reachable only when something real exists, so ERP opens the door.
        renderModal({ catalog: [MESH_ENTRY, BLANK, ERP] });
        await click(/Pre-built/);
        await click('Continue');

        expect(await screen.findByText(ERP.name)).toBeInTheDocument();
        expect(screen.queryByText(BLANK.name)).not.toBeInTheDocument();
        expect(screen.queryByText(MESH_ENTRY.name)).not.toBeInTheDocument();
    });
});
