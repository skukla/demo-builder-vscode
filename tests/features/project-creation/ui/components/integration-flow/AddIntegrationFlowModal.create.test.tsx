/**
 * Creating an Adobe project or workspace from the Deployment Destination lists (walk F286, owner
 * 2026-11-18): "the name needs to be on its own modal, and then we move to an appropriately sized
 * modal for the list". New on a list opens a short window of its own holding only the name field;
 * its one footer is Back, Cancel and Create. A created project comes back selected in the list.
 *
 * The project create runs through the REAL `useProjectCreationPhases` (only the webview request is
 * faked), so the create, the workspace read after it, and what each commits are the shipped ones.
 *
 * Shared preamble in AddIntegrationFlowModal.testUtils: import the SUT from there only.
 */

import { fireEvent, screen } from '@testing-library/react';

import {
    mockRequest,
    phasesMock,
    SIGNED_IN,
    PROJECT,
    renderFlowModal,
    button,
    click,
    expectDisabled,
    expectEnabled,
} from './AddIntegrationFlowModal.testUtils';
import type { WizardState } from '@/types/webview';

const actualPhases = jest.requireActual<
    typeof import('@/features/project-creation/ui/hooks/useProjectCreationPhases')
>('@/features/project-creation/ui/hooks/useProjectCreationPhases');

const RESERVED_IDS = new Set<string>();
const NEW_PROJECT = { id: 'p-new', name: 'kukla-demo', title: 'Kukla Demo' };
const NEW_WORKSPACE = { id: 'w-new', name: 'Production', title: 'Production' };
const FORBIDDEN = {
    success: false,
    code: 'AUTH_FORBIDDEN',
    error: 'You do not have permission to create a project. Select an existing project instead.',
};

type Answer = unknown | Promise<unknown>;

/** Answer each request type; anything unlisted succeeds empty. */
function answer(byType: Record<string, Answer>): void {
    mockRequest.mockImplementation((type: string) => {
        const reply = type in byType ? byType[type] : { success: true };
        return reply instanceof Promise ? reply : Promise.resolve(reply);
    });
}

const dialog = (): HTMLElement => screen.getByRole('dialog');

function footerButtons(): string[] {
    const footer = dialog().querySelector('.modal-footer-actions') as HTMLElement;
    return Array.from(footer.querySelectorAll('[role="button"]')).map((b) => b.textContent ?? '');
}

function footerStart(): string[] {
    const start = dialog().querySelector('.modal-footer-start') as HTMLElement;
    return Array.from(start.querySelectorAll('[role="button"]')).map((b) => b.textContent ?? '');
}

function typeName(label: string, value: string): void {
    fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
}

function renderDestination(initial: Partial<WizardState> = SIGNED_IN) {
    return renderFlowModal({ mode: 'destination', initial, reservedIds: RESERVED_IDS });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
    phasesMock.mockImplementation(
        (...args: Parameters<typeof actualPhases.useProjectCreationPhases>) =>
            actualPhases.useProjectCreationPhases(...args)
    );
    answer({});
});

describe('New on the project list opens a window of its own', () => {
    it('titled Create New Project, holding only the name field and its hint: no list, no inner buttons', async () => {
        renderDestination();
        const list = dialog();

        await click('new-project');

        expect(dialog()).not.toBe(list);
        expect(screen.getByRole('heading', { name: 'Create New Project' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Project Name/)).toBeInTheDocument();
        expect(screen.getByText('Will be created in Test Org')).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Browse' })).not.toBeInTheDocument();
    });

    it('has one footer: Back at the start, then Cancel and Create last', async () => {
        renderDestination();
        await click('new-project');

        expect(footerStart()).toEqual(['Back']);
        expect(footerButtons()).toEqual(['Back', 'Cancel', 'Create']);
    });

    it('holds Create until the name has something other than spaces', async () => {
        renderDestination();
        await click('new-project');

        expectDisabled('Create');
        typeName('Project Name', '   ');
        expectDisabled('Create');
        typeName('Project Name', 'Kukla Demo');
        expectEnabled('Create');
    });

    it('Back returns to the project list in a new window, creating nothing', async () => {
        renderDestination();
        await click('new-project');
        const create = dialog();

        await click('Back');

        expect(dialog()).not.toBe(create);
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Deployment Destination' })).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith('create-adobe-project', expect.anything());
    });
});

describe('Create on the project window', () => {
    it('sends the trimmed name and comes back to the list with the new project selected', async () => {
        answer({
            'create-adobe-project': { success: true, data: NEW_PROJECT, projects: [NEW_PROJECT] },
            'get-workspaces': { success: true, data: [NEW_WORKSPACE] },
        });
        renderDestination();
        // A row picked before New must not outrank the project just created.
        await click('pick-project');
        await click('new-project');

        typeName('Project Name', '  Kukla Demo ');
        await click('Create');

        expect(mockRequest).toHaveBeenCalledWith('create-adobe-project', { name: 'Kukla Demo' });
        expect(screen.getByTestId('project-field')).toHaveAttribute('data-shown', 'p-new');
        expect(screen.getByRole('heading', { name: 'Deployment Destination' })).toBeInTheDocument();

        await click('Continue');
        expect(screen.getByTestId('workspace-field')).toHaveAttribute('data-shown', 'w-new');
    });

    it('shows the button busy and holds Back while the project is being made', async () => {
        answer({ 'create-adobe-project': new Promise(() => {}) });
        renderDestination();
        await click('new-project');
        typeName('Project Name', 'Kukla Demo');

        await click('Create');

        expect(dialog().querySelector('[aria-busy="true"]')).toHaveTextContent('Create');
        expectDisabled('Back');
        expect(screen.getByLabelText(/Project Name/)).toBeDisabled();
    });

    it('shows a refusal under the field and stays, keeping the name', async () => {
        answer({ 'create-adobe-project': FORBIDDEN });
        renderDestination();
        await click('new-project');
        typeName('Project Name', 'Kukla Demo');

        await click('Create');

        expect(screen.getByText(FORBIDDEN.error)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Create New Project' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Project Name/)).toHaveValue('Kukla Demo');
        expectEnabled('Create');
    });

    it("titles a failed read of the new project's workspace in red, with Retry beside Cancel", async () => {
        answer({
            'create-adobe-project': { success: true, data: NEW_PROJECT, projects: [NEW_PROJECT] },
            'get-workspaces': { success: false, error: 'Adobe did not answer.' },
        });
        renderDestination();
        await click('new-project');
        typeName('Project Name', 'Kukla Demo');

        await click('Create');

        expect(screen.getByRole('heading', { name: 'Project Setup Failed' })).toBeInTheDocument();
        expect(screen.getByText('Adobe did not answer.')).toBeInTheDocument();
        expect(footerButtons()).toEqual(['Back', 'Cancel', 'Retry']);
    });
});

describe('New on the workspace list', () => {
    const ON_WORKSPACES: Partial<WizardState> = { ...SIGNED_IN, adobeProject: PROJECT };

    async function openWorkspaceCreate(): Promise<void> {
        renderDestination(ON_WORKSPACES);
        await click('Continue');
        await click('new-workspace');
    }

    it('opens Create New Workspace, naming the project it goes under', async () => {
        await openWorkspaceCreate();

        expect(screen.getByRole('heading', { name: 'Create New Workspace' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Workspace Name/)).toBeInTheDocument();
        expect(screen.getByText('Will be created under Demo Project')).toBeInTheDocument();
        expect(footerButtons()).toEqual(['Back', 'Cancel', 'Create']);
    });

    it('creates under the project and comes back to the list with it selected', async () => {
        answer({
            'create-adobe-workspace': {
                success: true,
                data: NEW_WORKSPACE,
                workspaces: [NEW_WORKSPACE],
            },
        });
        await openWorkspaceCreate();

        typeName('Workspace Name', 'Production');
        await click('Create');

        expect(mockRequest).toHaveBeenCalledWith('create-adobe-workspace', {
            name: 'Production',
            projectId: PROJECT.id,
        });
        expect(screen.getByTestId('workspace-field')).toHaveAttribute('data-shown', 'w-new');
        expect(button('Save')).toBeInTheDocument();
    });

    it('shows a failed create under the field and stays', async () => {
        answer({ 'create-adobe-workspace': { success: false, error: 'Workspace limit reached.' } });
        await openWorkspaceCreate();

        typeName('Workspace Name', 'Production');
        await click('Create');

        expect(screen.getByText('Workspace limit reached.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Create New Workspace' })).toBeInTheDocument();
    });
});
