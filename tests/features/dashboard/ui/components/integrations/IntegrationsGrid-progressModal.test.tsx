/**
 * PL-59 — the progress modal an integration operation opens on the integrations
 * screen: titled with the action and the integration, then the stage, its step and
 * how long it usually takes; closes by itself on success; stays with the reason,
 * Retry and Debug Logs on failure; "Run in background" hides it and the running tile
 * brings it back.
 */
import { act, screen, within } from '@testing-library/react';
import {
    captureMessageHandlers,
    card,
    cardsFor,
    DEPLOYED_INTEGRATION,
    getClient,
    MESH_COMPONENT,
    renderGrid,
    resetGridMocks,
    setupUser,
} from './IntegrationsGrid.testUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

const NOT_DEPLOYED = { 'custom-app': { ...DEPLOYED_INTEGRATION, status: 'not-deployed' as const } };
const DEPLOYING = { 'custom-app': { ...DEPLOYED_INTEGRATION, status: 'deploying' as const } };

const RUNNING: OperationProgressPayload = {
    id: 'custom-app',
    state: 'running',
    stage: 'Deploying the app',
    step: 'Running aio app deploy',
    expectation: 'Usually 1–2 minutes',
};

let pushes: Map<string, (data: unknown) => void>;

beforeEach(() => {
    resetGridMocks();
    pushes = captureMessageHandlers();
});

function push(payload: OperationProgressPayload): void {
    act(() => pushes.get('operationProgress')?.(payload));
}

async function startDeploy(user: ReturnType<typeof setupUser>): Promise<HTMLElement> {
    const tile = card('custom-app', 'Not deployed');
    await user.click(within(tile).getByRole('button', { name: /^deploy$/i }));
    return screen.getByRole('dialog', { name: 'Deploying custom-app' });
}

describe('the progress modal', () => {
    // Titled like the operation's own notification ("Deploying ERP Sync"), so the
    // handover on "Run in background" reads as the same thing carrying on. The tile
    // keeps its own status dot; the modal does not repeat it (owner, 2026-09-19).
    it('opens on a tile action, titled with the action and the integration', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });

        const modal = await startDeploy(user);

        expect(within(modal).getByText('Starting')).toBeInTheDocument();
        expect(within(modal).queryByText('Not deployed')).not.toBeInTheDocument();
    });

    it('names the action it runs', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: { 'custom-app': DEPLOYED_INTEGRATION } });

        await user.click(within(card('custom-app', 'Deployed')).getByRole('button', { name: /^redeploy$/i }));

        expect(screen.getByRole('dialog', { name: 'Redeploying custom-app' })).toBeInTheDocument();
    });

    it('shows the stage, its step, and how long the stage usually takes', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push(RUNNING);

        expect(within(modal).getByText('Deploying the app')).toBeInTheDocument();
        expect(within(modal).getByText('Running aio app deploy')).toBeInTheDocument();
        expect(within(modal).getByText('Usually 1–2 minutes')).toBeInTheDocument();
    });

    // The stage line can hold still for two minutes while Adobe works, and a modal
    // that never changes reads as a hang (owner, 2026-09-19).
    it('counts the seconds the stage has been running, beside the expectation', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);
        push(RUNNING);

        act(() => {
            jest.advanceTimersByTime(12000);
        });

        expect(
            within(modal).getByText('Usually 1–2 minutes · 12 seconds'),
        ).toBeInTheDocument();
    });

    it("shows the pair count in the stage line", async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ ...RUNNING, position: { index: 1, total: 2 } });

        expect(within(modal).getByText('Deploying the app (1 of 2)')).toBeInTheDocument();
    });

    it('ignores progress for another integration', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ ...RUNNING, id: 'someone-else' });

        expect(within(modal).queryByText('Deploying the app')).not.toBeInTheDocument();
    });

    // It used to vanish the instant the run succeeded, so a deploy the SC had
    // watched for two minutes ended with nothing said (owner, 2026-09-20). It shows
    // the result, then closes itself.
    it('shows the success, then closes by itself', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ id: 'custom-app', state: 'succeeded' });

        const success = within(modal).getByTestId('status-display');
        // The green tick itself is asserted where the mock carries the variant:
        // tests/core/ui/components/feedback/OperationProgressModal-prompt.tsx.
        expect(within(success).getByText('custom-app deployed')).toBeInTheDocument();

        // Long enough to read, then gone without a click.
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(
            screen.queryByRole('dialog', { name: 'Deploying custom-app' }),
        ).not.toBeInTheDocument();
    });

    it('stays open on failure with the reason', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ id: 'custom-app', state: 'failed', error: 'Adobe refused this.' });

        const failure = within(modal).getByTestId('status-display');
        expect(within(failure).getByText("Couldn't deploy custom-app")).toBeInTheDocument();
        expect(within(failure).getByText('Adobe refused this.')).toBeInTheDocument();
    });

    it('Retry sends the same operation and starts the modal clean, not on the old reason', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);
        push({ id: 'custom-app', state: 'failed', error: 'Adobe refused this.' });
        getClient().postMessage.mockClear();

        await user.click(within(modal).getByRole('button', { name: 'Retry' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', {
            id: 'custom-app',
            progress: 'modal',
        });
        const again = screen.getByRole('dialog', { name: 'Deploying custom-app' });
        expect(within(again).queryByText('Adobe refused this.')).not.toBeInTheDocument();
        expect(within(again).getByText('Starting')).toBeInTheDocument();
    });

    it('a new run never asks for the last run\'s state; a reopened one does', async () => {
        const user = setupUser();
        const { setCards } = renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        expect(getClient().request).not.toHaveBeenCalledWith(
            'getOperationProgress',
            expect.anything(),
        );

        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));
        setCards(cardsFor({ appBuilderComponents: DEPLOYING }));
        await user.click(card('custom-app', 'Deploying…'));

        expect(getClient().request).toHaveBeenCalledWith('getOperationProgress', {
            id: 'custom-app',
        });
    });

    it('offers the Debug Logs on failure', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ id: 'custom-app', state: 'failed', error: 'boom' });
        await user.click(within(modal).getByRole('button', { name: 'Open Debug Logs' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('openDebugLogs', {});
    });

    // The modal used to just vanish (owner, 2026-09-19); the notification carries on.
    it('"Run in background" hands the operation to a notification, by id and title', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));

        expect(getClient().postMessage).toHaveBeenCalledWith('backgroundOperation', {
            id: 'custom-app',
            title: 'Deploying custom-app',
        });
    });

    it('closing a failed operation hands nothing over: there is nothing left to narrate', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);
        push({ id: 'custom-app', state: 'failed', error: 'boom' });

        await user.click(within(modal).getByRole('button', { name: 'Close' }));

        expect(getClient().postMessage).not.toHaveBeenCalledWith(
            'backgroundOperation',
            expect.anything(),
        );
    });

    it('hides on "Run in background"', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));

        expect(screen.queryByRole('dialog', { name: 'Deploying custom-app' })).not.toBeInTheDocument();
    });

    it('reopens from the tile while the operation it started is still running', async () => {
        const user = setupUser();
        const { setCards } = renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);
        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));

        setCards(cardsFor({ appBuilderComponents: DEPLOYING }));
        await user.click(card('custom-app', 'Deploying…'));

        expect(screen.getByRole('dialog', { name: 'Deploying custom-app' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog', { name: 'custom-app details' })).not.toBeInTheDocument();
    });

    it('opens the flyout, not the modal, for a tile deploying for someone else', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: DEPLOYING });

        await user.click(card('custom-app', 'Deploying…'));

        expect(screen.queryByRole('dialog', { name: 'Deploying custom-app' })).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'custom-app details' })).toBeInTheDocument();
    });
});

// The mesh deploy (PL-59 slice 1). It is keyed by the mesh CARD's id, not by a
// component id — a first deploy happens before any mesh component exists — so
// reopening a running mesh tile has to look the operation up by that id.
describe('the mesh deploy', () => {
    // With a mesh COMPONENT present, the card's componentId is that component's
    // id while its own id stays 'mesh' — the pair the reopen has to tell apart.
    const meshOptions = {
        withMesh: true,
        meshToModal: true,
        appBuilderComponents: { 'eds-accs-mesh': { ...MESH_COMPONENT, status: 'not-deployed' as const } },
        meshStatus: 'not-deployed' as const,
        meshStatusText: 'Not deployed',
    };

    it('opens the modal titled for the mesh, and reopens it from the running tile', async () => {
        const user = setupUser();
        const { setCards } = renderGrid(meshOptions);

        const tile = card('API Mesh', 'Not deployed');
        await user.click(within(tile).getByRole('button', { name: /^deploy$/i }));

        expect(getClient().postMessage).toHaveBeenCalledWith('deployMesh', {
            id: 'mesh',
            progress: 'modal',
        });
        const modal = screen.getByRole('dialog', { name: 'Deploying API Mesh' });
        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));

        setCards(cardsFor({ ...meshOptions, meshStatus: 'deploying', meshStatusText: 'Deploying…' }));
        await user.click(card('API Mesh', 'Deploying…'));

        expect(screen.getByRole('dialog', { name: 'Deploying API Mesh' })).toBeInTheDocument();
    });
});
