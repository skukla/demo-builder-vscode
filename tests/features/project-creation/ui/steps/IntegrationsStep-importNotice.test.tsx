/**
 * IntegrationsStep — an imported demo asks for its own Adobe project (F280).
 *
 * An import or copy opens with no Adobe project (the file's is the sender's, and
 * deploying there replaced the sender's mesh). Until a project and workspace are
 * chosen, the Integrations area shows an amber notice that carries the "Choose Adobe
 * Project" button itself (F283 removed the separate "Not set / Set Up" line). An import
 * gets its own words; a new project or an Edit gets the general ones.
 *
 * The `jest.mock` preamble is repeated rather than shared, because a `jest.mock` only
 * hoists above the imports of its own file.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { settle } from '../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

// --- module-external mocks --------------------------------------------------
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn() },
    webviewClient: {
        request: jest.fn(),
        postMessage: jest.fn(),
        onMessage: jest.fn(() => () => {}),
    },
}));

jest.mock('@/features/project-creation/ui/hooks/useProjectCreationPhases', () => ({
    useProjectCreationPhases: jest.fn(),
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: () => <div data-testid="project-field">Project Field</div>,
    AdobeWorkspaceField: () => <div data-testid="workspace-field">Workspace Field</div>,
}));

import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import type { WizardState } from '@/types/webview';
import {
    COMMITTED_DEST,
    MESH_ID,
    PACKAGES,
    SIGNED_IN,
    STACKS,
    baseState,
    destinationLine,
} from './IntegrationsStep.testUtils';

const TITLE = 'Choose an Adobe Project';
const IMPORT_BODY =
    "Imported demos don't bring an Adobe project. Choose one or create a new one for this demo's integrations.";
const NEW_BODY =
    "This demo's integrations deploy into an Adobe project. Choose one or create a new one.";
const ACTION = 'Choose Adobe Project';

async function renderStep(state: WizardState): Promise<void> {
    render(
        <Provider theme={defaultTheme}>
            <IntegrationsStep
                state={state}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
                packages={PACKAGES}
                stacks={STACKS}
            />
        </Provider>
    );
    await settle();
}

function withMesh(overrides: Partial<WizardState>): WizardState {
    return baseState({ ...SIGNED_IN, selectedAppBuilderComponents: [MESH_ID], ...overrides });
}

const notice = (): HTMLElement => screen.getByTestId('adobe-project-notice');

describe('IntegrationsStep — the Adobe project notice (F280, F283)', () => {
    it('asks an import to choose a project, with the action in the notice and no destination line', async () => {
        await renderStep(withMesh({ wizardMode: 'import' }));

        expect(notice()).toHaveTextContent(TITLE);
        expect(notice()).toHaveTextContent(IMPORT_BODY);
        expect(within(notice()).getByRole('button', { name: ACTION })).toBeInTheDocument();
        // F283: the "Not set / Set Up" line is gone; the notice carries the action.
        expect(destinationLine()).toBeNull();
        expect(screen.queryByText('Not set')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Set Up' })).not.toBeInTheDocument();
    });

    it('asks a new project the same, in its own words', async () => {
        await renderStep(withMesh({ wizardMode: 'create' }));

        expect(notice()).toHaveTextContent(TITLE);
        expect(notice()).toHaveTextContent(NEW_BODY);
        expect(notice()).not.toHaveTextContent(IMPORT_BODY);
        expect(within(notice()).getByRole('button', { name: ACTION })).toBeInTheDocument();
        expect(destinationLine()).toBeNull();
    });

    it('asks an Edit with no project in the new-project words', async () => {
        await renderStep(withMesh({ wizardMode: 'edit' }));

        expect(notice()).toHaveTextContent(NEW_BODY);
    });

    it('goes once a project and workspace are chosen, leaving the destination line', async () => {
        await renderStep(withMesh({ wizardMode: 'import', ...COMMITTED_DEST }));

        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
        expect(destinationLine()).not.toBeNull();
    });

    it('is not shown with no integrations', async () => {
        await renderStep(baseState({ ...SIGNED_IN, wizardMode: 'import' }));

        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });
});
