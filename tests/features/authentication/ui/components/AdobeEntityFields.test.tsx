/**
 * AdobeEntityFields tests — the "select OR create" controls for the Adobe I/O target.
 *
 * Pins the create-flow wiring against the ported handlers:
 *  - `can-create-adobe-project` probe decides Flow A (show "+ Create new") vs Flow B
 *    (selection-only);
 *  - `create-adobe-project` / `create-adobe-workspace` are sent with the typed name and,
 *    on success, write `adobeProject` / `adobeWorkspace`;
 *  - a failed create surfaces the error inline (no state write).
 *
 * The selection pickers are mocked to sentinels (they have their own suites); the webview
 * request layer is mocked so the handler protocol is observable.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import type { WizardState } from '@/types/webview';

const request = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: (...args: unknown[]) => request(...args) },
}));
jest.mock('@/features/authentication/ui/components/AdobeProjectPicker', () => ({
    AdobeProjectPicker: () => <div data-testid="project-picker">Project Picker</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeWorkspacePicker', () => ({
    AdobeWorkspacePicker: () => <div data-testid="workspace-picker">Workspace Picker</div>,
}));

const EMPTY = {} as WizardState;

function renderField(node: React.ReactElement) {
    return render(<Provider theme={defaultTheme}>{node}</Provider>);
}

/** Resolve the can-create probe with a fixed verdict; other calls per `impl`. */
function mockRequests(canCreate: boolean, impl?: (type: string, payload?: unknown) => unknown) {
    request.mockImplementation((type: string, payload?: unknown) => {
        if (type === 'can-create-adobe-project') {
            return Promise.resolve({ success: true, data: { canCreate } });
        }
        return Promise.resolve(impl ? impl(type, payload) : { success: true });
    });
}

beforeEach(() => request.mockReset());

describe('AdobeProjectField', () => {
    it('always renders the selection picker', async () => {
        mockRequests(false);
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} />);
        expect(screen.getByTestId('project-picker')).toBeInTheDocument();
        await waitFor(() => expect(request).toHaveBeenCalledWith('can-create-adobe-project'));
    });

    it('hides the create affordance when not permitted (Flow B)', async () => {
        mockRequests(false);
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} />);
        await waitFor(() => expect(request).toHaveBeenCalledWith('can-create-adobe-project'));
        expect(screen.queryByRole('button', { name: /Create new/ })).not.toBeInTheDocument();
    });

    it('shows "+ Create new project" when permitted, and creates → writes adobeProject', async () => {
        const updateState = jest.fn();
        mockRequests(true, (type) =>
            type === 'create-adobe-project'
                ? { success: true, data: { id: 'p9', name: 'np', title: 'New Project' } }
                : { success: true },
        );
        renderField(<AdobeProjectField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: '+ Create new project' }));
        fireEvent.change(screen.getByLabelText('New project name'), { target: { value: 'np' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() =>
            expect(request).toHaveBeenCalledWith('create-adobe-project', { name: 'np' }),
        );
        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ adobeProject: expect.objectContaining({ id: 'p9' }) }),
            ),
        );
    });

    it('surfaces a create error inline (no state write)', async () => {
        const updateState = jest.fn();
        mockRequests(true, (type) =>
            type === 'create-adobe-project'
                ? { success: false, error: 'Name already exists' }
                : { success: true },
        );
        renderField(<AdobeProjectField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: '+ Create new project' }));
        fireEvent.change(screen.getByLabelText('New project name'), { target: { value: 'dup' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        expect(await screen.findByText('Name already exists')).toBeInTheDocument();
        expect(updateState).not.toHaveBeenCalled();
    });
});

describe('AdobeWorkspaceField', () => {
    it('creates a workspace → writes adobeWorkspace', async () => {
        const updateState = jest.fn();
        mockRequests(true, (type) =>
            type === 'create-adobe-workspace'
                ? { success: true, data: { id: 'w9', name: 'nw', title: 'New WS' } }
                : { success: true },
        );
        renderField(<AdobeWorkspaceField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: '+ Create new workspace' }));
        fireEvent.change(screen.getByLabelText('New workspace name'), { target: { value: 'nw' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() =>
            expect(request).toHaveBeenCalledWith('create-adobe-workspace', { name: 'nw' }),
        );
        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ adobeWorkspace: expect.objectContaining({ id: 'w9' }) }),
            ),
        );
    });
});
