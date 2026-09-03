/**
 * AddIntegrationFlowModal — later add + variants (Integrations flow redesign)
 *
 * The later-add journeys (destination already committed), the signed-out gate,
 * and the picker variants. Graybox like the base suite; this suite mounts the
 * modal WITHOUT a blank starter component and with the narrower id domain.
 *
 * Mocks, fixtures, harness and helpers live in AddIntegrationFlowModal.testUtils
 * (shared with the base suite) — import the SUT from there only.
 *
 */

import { screen, waitFor } from '@testing-library/react';

import { change } from '../../../../../helpers/reactSettle';
import {
    mockRequest,
    setPhases,
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
import type { WizardState } from '@/types/webview';

/** The composed collision domain the host threads in (blank naming). */
const RESERVED_IDS = new Set(['app-builder-shell', 'erp-sync', 'crm-connect', 'commerce-mesh']);

const SIGNED_OUT: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: false, isChecking: false },
    adobeOrg: undefined,
};

/** This suite mounts the modal WITHOUT a blank starter, over the narrow id domain. */
function renderModal(options: Omit<RenderOptions, 'reservedIds' | 'blankComponent'> = {}) {
    return renderFlowModal({ reservedIds: RESERVED_IDS, ...options });
}

/**
 * kind → source-catalog → pick ERP. Stops BEFORE the stage-advancing press,
 * because what that press DOES now depends on the destination: with one committed
 * the source stage is terminal (the press is "Add Integration"); without one it
 * advances to dest-project.
 */
async function walkCatalogToPick(): Promise<void> {
    await click(/Pre-built integration/);
    await click('Continue');
    await click(/ERP Sync/);
}

beforeEach(() => {
    jest.clearAllMocks();
    setPhases();
    mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });
});

// --- tests -----------------------------------------------------------------------
describe('AddIntegrationFlowModal — later add (destination committed)', () => {
    it('mesh later-add: the KIND stage is terminal, then Add commits + closes (never subscribes)', async () => {
        // No dest-summary step any more: a committed destination shows as a context
        // LINE, so picking the kind lands straight on the commit.
        const { builder, updateSpy, onClose } = renderModal({ initial: COMMITTED_DEST });
        await click(/API Mesh/);
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        // The modal provisions nothing — Add commits + closes in one press.
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expectEnabled('Add Integration');
        await click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(updateSpy).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('catalog later-add finishes on the SOURCE stage (no dest step, no api-access)', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        await walkCatalogToPick(); // kind → source-catalog → pick (terminal — dest is a line)
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        await click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Change on the destination CONTEXT LINE re-enters dest-project', async () => {
        renderModal({ initial: COMMITTED_DEST });
        await click(/API Mesh/);
        await click('Change');
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — catalog first-add walk', () => {
    it('gates Continue on the catalog stage until an entry is picked', async () => {
        renderModal();
        await click(/Pre-built integration/);
        await click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        expect(button(/CRM Connect/)).toBeInTheDocument();
        expectDisabled('Continue');
        await click(/ERP Sync/);
        expectEnabled('Continue');
    });

    it('walks the dest stages to the terminal workspace step — no api-access, no fetch', async () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['other-app'] } });
        await walkCatalogToPick();
        await click('Continue'); // no committed destination — advances to dest-project
        await click('pick-project');
        await click('Continue');
        await click('pick-ws');
        // dest-workspace is terminal for the deterministic catalog kind — no
        // api-access step and no org-API list fetch.
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'list-org-console-apis',
            expect.anything(),
            expect.anything()
        );
        expectEnabled('Add Integration');
    });

    it('a catalog finish writes no selectedConsoleApis (deterministic API access)', async () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        await walkCatalogToPick(); // source-catalog is terminal (dest is a context line)
        await click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ selectedConsoleApis: expect.anything() })
        );
    });
});

describe('AddIntegrationFlowModal — signed-out routing', () => {
    it('routes a signed-out add through dest-signin with a gated Continue', async () => {
        renderModal({ initial: SIGNED_OUT });
        await walkCatalogToPick();
        await click('Continue'); // signed out — the destination stages still run as steps
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

describe('AddIntegrationFlowModal — custom integration', () => {
    it('gates Continue until a valid URL and flags duplicates', async () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['acme-widget'] } });
        await click(/Import a repo/);
        await click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        await change(input, 'https://github.com/acme/widget');
        expect(screen.getByText('This integration is already added.')).toBeInTheDocument();
        expectDisabled('Continue');
        await change(input, 'https://github.com/acme/other');
        expectEnabled('Continue');
    });

    it('disables Continue again when a previously valid URL is cleared or invalidated', async () => {
        renderModal({ initial: COMMITTED_DEST });
        await click(/Import a repo/);
        await click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        await change(input, 'https://github.com/acme/widget');
        expectEnabled('Continue');

        await change(input, '');
        expectDisabled('Continue');

        await change(input, 'not-a-url');
        expectDisabled('Continue');
    });

    it('finishes a custom add on Add (interactive picker, no confirmation hold)', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        await click(/Import a repo/);
        await click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        await change(input, 'https://github.com/acme/widget');
        // No dest step: source-custom advances straight to api-access, with the
        // committed destination riding along as the context line.
        await click('Continue');
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        // Custom/import gets the INTERACTIVE picker (it can add any entitled API),
        // which fetches the org's list — not the informational deterministic panel.
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', expect.anything());
        // Add commits the repo + closes in a SINGLE press — no in-modal confirmation.
        await click('Add Integration');
        await waitFor(() =>
            expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
                { owner: 'acme', repo: 'widget' },
                // Optional-name model: the import mints the repo-named instance.
                { id: 'widget', name: 'widget' }
            )
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('AddIntegrationFlowModal — org-API prefetch (warm the cache)', () => {
    it('fires exactly one list-org-console-apis warm request when opened signed in', () => {
        renderModal();
        const warmCalls = mockRequest.mock.calls.filter(
            ([type]) => type === 'list-org-console-apis'
        );
        expect(warmCalls).toHaveLength(1);
        expect(warmCalls[0]).toEqual(['list-org-console-apis', { componentIds: [] }]);
    });

    it('does not warm the cache while the modal is closed', () => {
        renderModal({ isOpen: false });
        expect(mockRequest).not.toHaveBeenCalledWith('list-org-console-apis', expect.anything());
    });

    it('does not warm the cache when signed out', () => {
        renderModal({ initial: SIGNED_OUT });
        expect(mockRequest).not.toHaveBeenCalledWith('list-org-console-apis', expect.anything());
    });
});

describe('AddIntegrationFlowModal — destination mode', () => {
    it('walks project → workspace and Saves without builder calls', async () => {
        const { builder, updateSpy, onClose } = renderModal({ mode: 'destination' });
        await click('pick-project');
        await click('Continue');
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
        await click('pick-ws');
        await click('Save');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeWorkspace: { id: 'w-picked', name: 'Stage', title: 'Stage' },
        });
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('AddIntegrationFlowModal — cancel & reopen', () => {
    it('Cancel calls onClose without builder calls or state writes', async () => {
        const { builder, updateSpy, onClose } = renderModal();
        await walkMeshToProject();
        await click('pick-project');
        await click('Cancel');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('reopening starts a fresh journey at the kind stage', async () => {
        const { setOpen } = renderModal();
        await click(/Pre-built integration/);
        await click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        setOpen(false);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        setOpen(true);
        expect(button(/Pre-built integration/)).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

describe('AddIntegrationFlowModal — phase-running bridge', () => {
    it('a running destination phase disables Continue (setPhaseRunning seam)', async () => {
        const { setOpen } = renderModal();
        await walkMeshToProject();
        await click('pick-project');
        expectEnabled('Continue');
        setPhases({ phase: 'creating', phaseMessage: 'Creating project…' });
        setOpen(true);
        expect(screen.getByText('Creating project…')).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

/**
 * `describe('integration-flow module index')` was DELETED here on 2026-08-31
 * (PL-31). It required the barrel's export list to equal an exact array, and
 * carried a long comment tracking what had entered and left "the public runtime
 * API" over time.
 *
 * That surface no longer exists as a thing to pin. A module is imported by the
 * path that DECLARES the symbol, so each file is its own public API and the
 * `reExportIndex` ledger fails the build if a re-export index reappears. The
 * component tests around it are what still measure behaviour.
 */
