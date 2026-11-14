/**
 * The Add Integration flow's windows (step-07 Win3; owner 2026-11-14, "Back on track"): the flow is
 * Steps windows. Stages of a comparable height share the first stage's window, which holds that
 * height; a stage much taller than the first (the pre-built gallery, the project and workspace
 * lists, the API list) opens as a window of its own at its own size, never a scrolling body. Back
 * sits at the footer's start.
 *
 * jsdom has no layout, so the heights themselves are a visual check (screenshots owed); this pins
 * the structure: which stages share a window (the same dialog element), which open a new one, and
 * that each holds the height it opens at (`is-locked`).
 */

import { screen, waitFor } from '@testing-library/react';
import {
    mockRequest,
    setPhases,
    COMMITTED_DEST,
    APIS,
    renderFlowModal,
    click,
    walkMeshToProject,
} from './AddIntegrationFlowModal.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

const BLANK: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'Custom Integration',
    description: 'A minimal custom integration to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

const RESERVED_IDS = new Set([
    'app-builder-shell',
    'erp-sync',
    'crm-connect',
    'commerce-mesh',
    'existing-integration',
]);

function renderModal(initial = {}) {
    return renderFlowModal({ blankComponent: BLANK, reservedIds: RESERVED_IDS, initial });
}

const dialog = (): HTMLElement => screen.getByRole('dialog');
const footerStart = (): HTMLElement | null => document.querySelector('.modal-footer-start');

beforeEach(() => {
    jest.clearAllMocks();
    setPhases();
    mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });
});

describe('AddIntegrationFlowModal: its windows', () => {
    it('puts Back at the footer start, apart from Cancel and Continue', () => {
        renderModal();

        expect(footerStart()).toHaveTextContent('Back');
        expect(footerStart()).not.toHaveTextContent('Continue');
        expect(footerStart()).not.toHaveTextContent('Cancel');
    });

    it('holds the height the first stage opens at', () => {
        renderModal();

        expect(dialog()).toHaveClass('is-locked');
    });

    it('keeps the first window for a stage of comparable height (the custom name)', async () => {
        renderModal(COMMITTED_DEST);
        const first = dialog();

        await click(/Build Custom/);
        await click('Continue');

        expect(screen.getByLabelText(/Name \(Optional\)/)).toBeInTheDocument();
        expect(dialog()).toBe(first);
    });

    it('opens the pre-built gallery as a window of its own, holding its own height', async () => {
        renderModal(COMMITTED_DEST);
        const first = dialog();

        await click(/Pre-Built/);
        await click('Continue');

        expect(dialog()).not.toBe(first);
        expect(dialog()).toHaveClass('is-locked');
    });

    it('opens the project list as a window of its own, and Back returns to a new first window', async () => {
        renderModal();
        const first = dialog();

        await walkMeshToProject();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        const projects = dialog();
        expect(projects).not.toBe(first);

        await click('Back');
        expect(dialog()).not.toBe(projects);
    });

    it('opens the API list as a window of its own', async () => {
        renderModal(COMMITTED_DEST);
        await click(/Build Custom/);
        await click('Continue');
        const named = dialog();

        await click('Continue');
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());

        expect(dialog()).not.toBe(named);
        expect(dialog()).toHaveClass('is-locked');
    });
});
