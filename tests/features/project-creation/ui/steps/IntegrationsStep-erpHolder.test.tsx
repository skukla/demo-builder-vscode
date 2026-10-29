/**
 * IntegrationsStep — one Commerce instance runs one ERP integration (AB-78).
 *
 * Graybox: the real Add Integration modal, stage switch and gallery, over the real
 * catalog. Asserted: with another project holding the instance, the ERP integration's
 * gallery tile is greyed out (the API Mesh treatment) under a banner saying what to do
 * instead (that the other tiles stay pickable is the gallery's own suite); the Build step's line shows above
 * the results (when to show it is the Build step's suite); and with nothing
 * unavailable nothing changes.
 *
 * The `jest.mock` preamble is repeated rather than shared, because a `jest.mock` only
 * hoists above the imports of its own file.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { press, settle } from '../../../../helpers/reactSettle';
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

import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import type { UnavailableEntries } from '@/features/project-creation/ui/components/integration-flow/stages/CatalogStage';
import type { WizardState } from '@/types/webview';
import { PACKAGES, STACKS, baseState } from './IntegrationsStep.testUtils';

const MESSAGE = 'JustRite already has an ERP integration on this Commerce instance. Add your ERP there instead.';
const UNAVAILABLE: UnavailableEntries = { message: MESSAGE, ids: ['erp-integration'] };

async function renderStep(state: WizardState, unavailable?: UnavailableEntries, notice?: React.ReactNode): Promise<void> {
    render(
        <Provider theme={defaultTheme}>
            <IntegrationsStep
                state={state}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
                packages={PACKAGES}
                stacks={STACKS}
                unavailable={unavailable}
                notice={notice}
            />
        </Provider>,
    );
    await settle();
}

/** Open Add Integration on the pre-built gallery. */
async function openGallery(): Promise<HTMLElement> {
    await press(screen.getByRole('button', { name: 'Add Integration' }));
    const dialog = screen.getByRole('dialog');
    await press(within(dialog).getByRole('button', { name: /Pre-built integration/ }));
    await press(within(dialog).getByRole('button', { name: 'Continue' }));
    return dialog;
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

describe('IntegrationsStep — an instance that already has an ERP integration', () => {
    it('greys the ERP integration out under a banner saying what to do instead', async () => {
        await renderStep(baseState(), UNAVAILABLE);

        const dialog = await openGallery();

        expect(within(dialog).getByRole('button', { name: /ERP Integration/ })).toBeDisabled();
        expect(within(dialog).getByTestId('catalog-unavailable')).toHaveTextContent(MESSAGE);
        // Its only tile is out, so there is nothing to name.
        expect(within(dialog).queryByLabelText(/Name \(optional\)/)).not.toBeInTheDocument();
    });

    it('leaves it pickable when nothing is unavailable — control', async () => {
        await renderStep(baseState());

        const dialog = await openGallery();

        expect(within(dialog).getByRole('button', { name: /ERP Integration/ })).toBeEnabled();
        expect(within(dialog).queryByTestId('catalog-unavailable')).not.toBeInTheDocument();
    });

    it('shows the line it is given above the results', async () => {
        await renderStep(baseState(), UNAVAILABLE, <div data-testid="held-line">held</div>);

        expect(screen.getByTestId('held-line')).toBeInTheDocument();
    });
});
