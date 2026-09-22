/**
 * PL-59 — the progress modal an integration operation opens on the integrations
 * screen: the tile's live status on top, the stage, its step and how long it usually
 * takes; closes by itself on success; stays with the reason, Retry and Debug Logs on
 * failure; "Run in background" hides it and the running tile brings it back.
 */
import { act, screen, within } from '@testing-library/react';
import {
    captureMessageHandlers,
    card,
    cardsFor,
    DEPLOYED_INTEGRATION,
    getClient,
    renderGrid,
    resetGridMocks,
    setupUser,
} from './IntegrationsGrid.testUtils';
import type { ComponentOperationProgressPayload } from '@/types/webviewPayloads';

const NOT_DEPLOYED = { 'custom-app': { ...DEPLOYED_INTEGRATION, status: 'not-deployed' as const } };
const DEPLOYING = { 'custom-app': { ...DEPLOYED_INTEGRATION, status: 'deploying' as const } };

const RUNNING: ComponentOperationProgressPayload = {
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

function push(payload: ComponentOperationProgressPayload): void {
    act(() => pushes.get('componentOperationProgress')?.(payload));
}

async function startDeploy(user: ReturnType<typeof setupUser>): Promise<HTMLElement> {
    const tile = card('custom-app', 'Not deployed');
    await user.click(within(tile).getByRole('button', { name: /^deploy$/i }));
    return screen.getByRole('dialog', { name: 'custom-app' });
}

describe('the progress modal', () => {
    it('opens on a tile action with the tile status on top', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });

        const modal = await startDeploy(user);

        expect(within(modal).getByText('Not deployed')).toBeInTheDocument();
        expect(within(modal).getByText('Starting')).toBeInTheDocument();
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

    it('ignores progress for another integration', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ ...RUNNING, id: 'someone-else' });

        expect(within(modal).queryByText('Deploying the app')).not.toBeInTheDocument();
    });

    it('closes by itself when the operation succeeds', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        await startDeploy(user);

        push({ id: 'custom-app', state: 'succeeded' });

        expect(screen.queryByRole('dialog', { name: 'custom-app' })).not.toBeInTheDocument();
    });

    it('stays open on failure with the reason', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        push({ id: 'custom-app', state: 'failed', error: 'Adobe refused this.' });

        expect(within(modal).getByText('Adobe refused this.')).toBeInTheDocument();
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
        const again = screen.getByRole('dialog', { name: 'custom-app' });
        expect(within(again).queryByText('Adobe refused this.')).not.toBeInTheDocument();
        expect(within(again).getByText('Starting')).toBeInTheDocument();
    });

    it('a new run never asks for the last run\'s state; a reopened one does', async () => {
        const user = setupUser();
        const { setCards } = renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        expect(getClient().request).not.toHaveBeenCalledWith(
            'getComponentOperationProgress',
            expect.anything(),
        );

        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));
        setCards(cardsFor({ appBuilderComponents: DEPLOYING }));
        await user.click(card('custom-app', 'Deploying'));

        expect(getClient().request).toHaveBeenCalledWith('getComponentOperationProgress', {
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

    it('hides on "Run in background"', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);

        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));

        expect(screen.queryByRole('dialog', { name: 'custom-app' })).not.toBeInTheDocument();
    });

    it('reopens from the tile while the operation it started is still running', async () => {
        const user = setupUser();
        const { setCards } = renderGrid({ appBuilderComponents: NOT_DEPLOYED });
        const modal = await startDeploy(user);
        await user.click(within(modal).getByRole('button', { name: 'Run in background' }));

        setCards(cardsFor({ appBuilderComponents: DEPLOYING }));
        await user.click(card('custom-app', 'Deploying'));

        expect(screen.getByRole('dialog', { name: 'custom-app' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog', { name: 'custom-app details' })).not.toBeInTheDocument();
    });

    it('opens the flyout, not the modal, for a tile deploying for someone else', async () => {
        const user = setupUser();
        renderGrid({ appBuilderComponents: DEPLOYING });

        await user.click(card('custom-app', 'Deploying'));

        expect(screen.queryByRole('dialog', { name: 'custom-app' })).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'custom-app details' })).toBeInTheDocument();
    });
});
