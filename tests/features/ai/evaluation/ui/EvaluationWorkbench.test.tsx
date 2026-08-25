/**
 * The workbench: try a prompt, read the verdict, apply a fix, try again.
 *
 * THE ONE HARD UI RULE is tested here — "Run this for real" must be
 * unmistakable. The user will have spent minutes reading "would have"; a button
 * that changes their project for real cannot look like the others. That is a
 * user-safety property, not styling, so it is asserted rather than eyeballed.
 */

import {
    mockRequest,
    renderWorkbench,
    resetWorkbenchMocks,
    screen,
    setupUser,
    verdictResponse,
} from './EvaluationWorkbench.testUtils';

describe('the workbench', () => {
    beforeEach(() => {
        resetWorkbenchMocks();
    });

    async function evaluateWith(response: unknown, prompt = 'deploy the mesh') {
        const user = setupUser();
        mockRequest.mockResolvedValue(response);
        renderWorkbench();
        await user.type(screen.getByRole('textbox'), prompt);
        await user.click(screen.getByRole('button', { name: /try it out/i }));
        return user;
    }

    it('will not run an empty prompt', async () => {
        renderWorkbench();

        expect(screen.getByRole('button', { name: /try it out/i })).toBeDisabled();
    });

    it('leads with "nothing was changed", because that is the reassurance', async () => {
        await evaluateWith(verdictResponse());

        expect(await screen.findByText(/nothing was changed/i)).toBeInTheDocument();
    });

    it('reports cost in DOLLARS, not tokens', async () => {
        // "$0.21" means something to a demo builder; "47,550 tokens" does not.
        await evaluateWith(verdictResponse());

        expect(await screen.findByText(/\$0\.21/)).toBeInTheDocument();
    });

    it('shows the waste, with the evidence behind it', async () => {
        // A suggestion without its trace fact is an opinion the user cannot
        // check.
        await evaluateWith(verdictResponse());

        expect(await screen.findByText(/say which project you mean/i)).toBeInTheDocument();
        expect(screen.getByText(/looked up which project you meant twice/i)).toBeInTheDocument();
    });

    it('says plainly what it would have changed', async () => {
        await evaluateWith(verdictResponse());

        expect(await screen.findByTestId('evaluation-blocked')).toHaveTextContent('deploy_mesh');
    });

    it('APPENDS a suggestion to the prompt rather than rewriting it', async () => {
        // The user's words are theirs. A suggestion that replaced the prompt
        // would lose whatever it did not understand.
        const user = await evaluateWith(verdictResponse());
        await screen.findByText(/say which project you mean/i);

        await user.click(screen.getByRole('link', { name: /add it to my prompt/i }));

        expect(screen.getByRole('textbox')).toHaveValue('deploy the mesh for bodea');
    });

    it('shows the delta on a second run, so improvement is the headline', async () => {
        const user = await evaluateWith(verdictResponse());
        await screen.findByText(/\$0\.21/);

        mockRequest.mockResolvedValue(
            verdictResponse({ costUSD: 0.14, trace: [], repeats: [], blocked: [] }),
        );
        await user.click(screen.getByRole('button', { name: /try it again/i }));

        expect(await screen.findByText(/down from \$0\.21/i)).toBeInTheDocument();
    });

    it('surfaces a REFUSAL, which arrives looking like a success', async () => {
        // Only a THROW sets the response error field, so `{success:false}`
        // resolves normally. A UI that did not branch on `success` would render
        // a refusal as a result.
        await evaluateWith({ success: false, error: 'An evaluation is already running.' });

        expect(await screen.findByTestId('evaluation-error')).toHaveTextContent(
            'An evaluation is already running.',
        );
    });

    describe('the run-for-real button', () => {
        it('is not offered until something has been tried out', () => {
            renderWorkbench();

            expect(screen.queryByRole('button', { name: /run this for real/i })).toBeNull();
        });

        it('says what it is about to do, and does not look like the others', async () => {
            await evaluateWith(verdictResponse());

            const button = await screen.findByRole('button', { name: /run this for real/i });
            // Distinct wording AND distinct styling — both, because after
            // minutes of "would have" either alone is easy to miss.
            expect(button).toHaveTextContent(/run this for real in the chat/i);
            expect(button).toHaveAttribute('data-variant', 'negative');
            expect(screen.getByRole('button', { name: /try it again/i })).toHaveAttribute(
                'data-variant',
                'cta',
            );
        });

        it('hands off to the CHAT rather than running headlessly', async () => {
            // Real work belongs where the user can watch it and stop it.
            const user = await evaluateWith(verdictResponse());
            await screen.findByText(/nothing was changed/i);

            await user.click(screen.getByRole('button', { name: /run this for real/i }));

            expect(mockRequest).toHaveBeenLastCalledWith('openInClaude', {
                prompt: 'deploy the mesh',
            });
        });
    });
});
