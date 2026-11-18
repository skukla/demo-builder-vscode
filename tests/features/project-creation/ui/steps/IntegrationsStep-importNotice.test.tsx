/**
 * IntegrationsStep — an imported demo asks for its own Adobe project (F280).
 *
 * An import or copy opens with no Adobe project (the file's is the sender's, and
 * deploying there replaced the sender's mesh). The Integrations area says so above
 * the Adobe Project line: only on an import, only while no project and workspace
 * are chosen, and never on a new project or an Edit.
 *
 * The `jest.mock` preamble is repeated rather than shared, because a `jest.mock` only
 * hoists above the imports of its own file.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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
const BODY =
    "Imported demos don't bring an Adobe project. Choose one or create a new one for this demo's integrations.";

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

describe('IntegrationsStep — the imported-demo project notice', () => {
    it('asks an import to choose a project, above the Adobe Project line', async () => {
        await renderStep(withMesh({ wizardMode: 'import' }));

        const notice = screen.getByTestId('import-adobe-project-notice');
        expect(notice).toHaveTextContent(TITLE);
        expect(notice).toHaveTextContent(BODY);
        // Above the line: the notice comes first in document order.
        expect(
            notice.compareDocumentPosition(destinationLine()) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('goes once the import has a project and workspace', async () => {
        await renderStep(withMesh({ wizardMode: 'import', ...COMMITTED_DEST }));

        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });

    it('is not shown on a new project', async () => {
        await renderStep(withMesh({ wizardMode: 'create' }));

        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });

    it('is not shown on an Edit', async () => {
        await renderStep(withMesh({ wizardMode: 'edit' }));

        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });
});
