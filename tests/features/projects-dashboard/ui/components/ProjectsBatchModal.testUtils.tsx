/**
 * Shared setup for the batch window's suites: the house Modal reduced to its title, wait, body and
 * buttons, a harness that drives the REAL `useProjectsBatch` into the REAL window, and the
 * extension's answers and pushes, typed to the contract (`@/types/projectsBatch`).
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import { mockPostMessage, mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { createProjectsDashboardProject } from '../../testUtils';
import type { ActionButton, ModalWait } from '@/core/ui/components/ui/Modal';
import type { Project } from '@/types/base';
import type { PrepareProjectsBatchResponse, ProjectsBatchAction, ProjectsBatchRowStatus } from '@/types/projectsBatch';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({
        title,
        status,
        actionButtons = [],
        onClose,
        closeLabel,
        hideClose,
        waiting,
        children,
    }: {
        title: string;
        status?: string;
        actionButtons?: ActionButton[];
        onClose: () => void;
        closeLabel?: string;
        hideClose?: boolean;
        waiting?: ModalWait | false;
        children: React.ReactNode;
    }) => (
        <div role="dialog" aria-label={title} data-status={status}>
            {waiting ? <p>{waiting.message}</p> : children}
            {!hideClose && <button onClick={onClose}>{closeLabel ?? 'Close'}</button>}
            {(waiting ? [] : actionButtons).map((b) => (
                <button key={b.label} onClick={b.onPress} disabled={b.isDisabled} data-variant={b.variant}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

// Below the mocks on purpose: they must register before the window binds to Modal.
import { ProjectsBatchModal } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import { useProjectsBatch } from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import { PROJECTS_BATCH_OPERATION_ID } from '@/core/utils/operationIds';

export { mockPostMessage, mockRequest, PROJECTS_BATCH_OPERATION_ID };

export const PROJECTS: Project[] = ['a', 'b', 'c'].map((id) =>
    createProjectsDashboardProject({ name: id.toUpperCase(), path: `/p/${id}` }),
);

/** The prepare's answer, as the extension sends it. */
export type PrepareEnvelope = { success: true; data: PrepareProjectsBatchResponse } | { success: false; error: string };

/**
 * What each request answers: the prepare as given (`null`: not yet), the run never, since it ends
 * on the progress channel.
 */
export function answers(prepare: PrepareEnvelope | null): void {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'prepareProjectsBatch' && prepare) return Promise.resolve(prepare);
        return new Promise(() => undefined);
    });
}

function Harness({ action, onClosed }: { action: ProjectsBatchAction; onClosed: () => void }) {
    const controls = useProjectsBatch(onClosed);
    return (
        <>
            <button onClick={() => controls.start(action, PROJECTS)}>Open Window</button>
            <ProjectsBatchModal controls={controls} />
        </>
    );
}

export const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

/** Opens the window on the three projects and lets the prepare's answer land. */
export async function openOn(action: ProjectsBatchAction, prepare: PrepareEnvelope | null) {
    answers(prepare);
    const onClosed = jest.fn();
    const user = setupUser();
    render(<Harness action={action} onClosed={onClosed} />);
    await user.click(screen.getByRole('button', { name: 'Open Window' }));
    // The window waits for the prepare's answer; let it land before the test reads the window.
    if (prepare) await waitFor(() => expect(screen.queryByText(/^Reading /)).toBeNull());
    return { user, onClosed };
}

/** The extension pushes a row's status, or the run's progress. */
export async function push(type: 'projectsBatchRow' | 'operationProgress', payload: ProjectsBatchRowStatus | OperationProgressPayload) {
    await act(async () => {
        webviewClientHandlers.get(type)?.(payload);
    });
}

/** The run request the window sent. */
export function runRequest(): unknown {
    return mockRequest.mock.calls.find(([type]) => type === 'runProjectsBatch')?.[1];
}

export function resetBatchMocks(): void {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
}
