/**
 * The dialog while it reads the org's Adobe APIs for the api-access stage: a wait with nothing else
 * on screen, and a failed read as its title and status icon rather than a big icon in the body. The
 * read itself is `useOrgApis.test.ts`.
 *
 * Shared preamble in AddIntegrationFlowModal.testUtils: import the SUT from there only.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import {
    mockRequest,
    setPhases,
    APIS,
    COMMITTED_DEST,
    SIGNED_IN,
    renderFlowModal,
    click,
} from './AddIntegrationFlowModal.testUtils';

const RESERVED_IDS = new Set<string>();
const SIGNED_OUT_ANSWER = { success: false, error: 'Adobe sign-in required.', code: 'AUTH_REQUIRED' };
const FAILED_ANSWER = { success: false, error: 'Adobe API catalog unavailable.' };

function answerList(answer: unknown): void {
    mockRequest.mockImplementation(() =>
        answer instanceof Promise ? answer : Promise.resolve(answer),
    );
}

function footerButtons(): string[] {
    const footer = screen.getByRole('dialog').querySelector('.modal-footer-actions') as HTMLElement;
    return Array.from(footer.querySelectorAll('[role="button"]')).map((b) => b.textContent ?? '');
}

function renderEdit(onSignIn?: () => Promise<unknown>) {
    return renderFlowModal({
        mode: 'api-edit',
        initial: { ...SIGNED_IN, ...COMMITTED_DEST },
        reservedIds: RESERVED_IDS,
        onSignIn,
    });
}

/** The add journey as far as the api-access stage, by importing a repo. */
async function walkAddToApis(onSignIn?: () => Promise<unknown>) {
    const view = renderFlowModal({ initial: COMMITTED_DEST, reservedIds: RESERVED_IDS, onSignIn });
    await click(/Import a repo/);
    await click('Continue');
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
        target: { value: 'https://github.com/acme/widget' },
    });
    await click('Continue');
    return view;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
    setPhases();
    answerList({ success: true, data: { apis: APIS } });
});

describe('AddIntegrationFlowModal — while it reads the APIs', () => {
    it('shows only the title, a spinner and Cancel: no destination line, no words, no Save', async () => {
        answerList(new Promise(() => {}));
        renderEdit();
        await act(async () => {});

        expect(screen.getByRole('heading', { name: 'Edit API Access' })).toBeInTheDocument();
        expect(screen.getByRole('dialog').querySelector('.modal-wait')).not.toBeNull();
        expect(screen.queryByText(/Loading Adobe APIs/)).not.toBeInTheDocument();
        expect(screen.queryByText('Demo Project, Stage')).not.toBeInTheDocument();
        expect(screen.queryByTestId('api-picker-stage')).not.toBeInTheDocument();
        expect(footerButtons()).toEqual(['Cancel']);
    });

    it('shows the destination line, the list and Save once it has read them', async () => {
        renderEdit();

        expect(await screen.findByTestId('api-picker-stage')).toBeInTheDocument();
        expect(screen.getByText('Demo Project, Stage')).toBeInTheDocument();
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Save']);
    });
});

describe('AddIntegrationFlowModal — a failed read of the APIs', () => {
    it('titles it with the red icon, says why, and offers Retry and not Save', async () => {
        answerList(FAILED_ANSWER);
        renderEdit();

        const title = await screen.findByRole('heading', { name: "Couldn't load Adobe APIs" });
        expect(title.innerHTML).toContain('text-negative');
        expect(screen.getByTestId('api-access-problem')).toHaveTextContent('Adobe API catalog unavailable.');
        expect(screen.queryByText('Demo Project, Stage')).not.toBeInTheDocument();
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Retry']);
    });

    it('reads again on Retry, back to the list', async () => {
        answerList(FAILED_ANSWER);
        renderEdit();
        await screen.findByRole('heading', { name: "Couldn't load Adobe APIs" });

        answerList({ success: true, data: { apis: APIS } });
        await click('Retry');

        expect(await screen.findByTestId('api-picker-stage')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Edit API Access' })).toBeInTheDocument();
    });

    // Picks are optional and change later in Manage APIs, so a failed read never stopped an add.
    it('still lets an add finish, with the main button last', async () => {
        answerList(FAILED_ANSWER);
        const { builder, onClose } = await walkAddToApis();

        await screen.findByRole('heading', { name: "Couldn't load Adobe APIs" });
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Retry', 'Add Integration']);

        await click('Add Integration');
        await waitFor(() => expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('AddIntegrationFlowModal — signed out when it reads the APIs', () => {
    it('titles it amber and offers the sign-in, never a Retry and not Save', async () => {
        answerList(SIGNED_OUT_ANSWER);
        renderEdit(jest.fn().mockResolvedValue(undefined));

        const title = await screen.findByRole('heading', { name: 'Sign in to Adobe' });
        expect(title.innerHTML).toContain('text-orange-600');
        expect(screen.getByText(/Your Adobe session has ended/)).toBeInTheDocument();
        expect(screen.getByText('Adobe sign-in will open in your browser.')).toBeInTheDocument();
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Sign In with Adobe']);
    });

    it('reads again once the host sign-in finishes', async () => {
        answerList(SIGNED_OUT_ANSWER);
        const onSignIn = jest.fn().mockResolvedValue(undefined);
        renderEdit(onSignIn);
        await screen.findByRole('heading', { name: 'Sign in to Adobe' });

        answerList({ success: true, data: { apis: APIS } });
        await click('Sign In with Adobe');

        expect(onSignIn).toHaveBeenCalledTimes(1);
        expect(await screen.findByTestId('api-picker-stage')).toBeInTheDocument();
    });

    it('offers no dead button when the host has no sign-in: the reason still shows', async () => {
        answerList(SIGNED_OUT_ANSWER);
        renderEdit();

        await screen.findByRole('heading', { name: 'Sign in to Adobe' });
        expect(footerButtons()).toEqual(['Cancel', 'Back']);
    });

    it('puts the sign-in before the main button on an add', async () => {
        answerList(SIGNED_OUT_ANSWER);
        await walkAddToApis(jest.fn().mockResolvedValue(undefined));

        await screen.findByRole('heading', { name: 'Sign in to Adobe' });
        expect(footerButtons()).toEqual(['Cancel', 'Back', 'Sign In with Adobe', 'Add Integration']);
    });
});
