/**
 * The workbench: try a prompt, read the verdict, apply a fix, try again.
 *
 * THE ONE HARD UI RULE is tested here — "Run this for real" must be
 * unmistakable. The user will have spent minutes reading "would have"; a button
 * that changes their project for real cannot look like the others. That is a
 * user-safety property, not styling, so it is asserted rather than eyeballed.
 */

import {
    SAVED_PROMPT,
    pushMessage,
    mockRequest,
    renderWorkbench,
    resetWorkbenchMocks,
    respondByType,
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

    it('shows the delta from the STORED past, not from session state', async () => {
        // The point of step 07. The previous run arrives in the RESPONSE, read
        // from the project manifest — so this renders on a FIRST mount, which is
        // what a reloaded window is. Holding it in React state made "down from
        // $0.21" die with the window, and "is this getting better" is the
        // question the whole feature exists to answer.
        await evaluateWith(
            verdictResponse({
                costUSD: 0.14,
                priorRuns: 1,
                previousRun: {
                    prompt: 'deploy the mesh',
                    costUSD: 0.21,
                    steps: 8,
                    wastedSteps: 3,
                    durationMs: 41_000,
                    at: '2026-08-24T10:00:00.000Z',
                },
            })
        );

        expect(await screen.findByText(/down from \$0\.21/i)).toBeInTheDocument();
    });

    it('says nothing about a delta when the prompt has no past', async () => {
        // "No change" and "never run before" are different facts. A zero delta
        // would read as the first.
        await evaluateWith(verdictResponse());

        expect(await screen.findByText(/nothing was changed/i)).toBeInTheDocument();
        expect(screen.queryByText(/down from|up from/i)).toBeNull();
    });

    it('surfaces a REFUSAL, which arrives looking like a success', async () => {
        // Only a THROW sets the response error field, so `{success:false}`
        // resolves normally. A UI that did not branch on `success` would render
        // a refusal as a result.
        await evaluateWith({ success: false, error: 'An evaluation is already running.' });

        expect(await screen.findByTestId('evaluation-error')).toHaveTextContent(
            'An evaluation is already running.'
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
                'cta'
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

    describe('coming back to a prompt', () => {
        /** Load the one saved prompt through the picker. */
        async function loadSaved(resume: unknown) {
            const user = setupUser();
            respondByType({
                'list-ai-prompts': { success: true, aiPrompts: [SAVED_PROMPT] },
                'resume-evaluation-thread': resume,
                'evaluate-prompt': verdictResponse({ threadId: 'thread-9' }),
            });
            renderWorkbench();
            const picker = await screen.findByRole('combobox');
            await user.selectOptions(picker, 'saved-1');
            return user;
        }

        it('fills the box from the library and says where it left off', async () => {
            // The missing half of the loop: a producer who saved a good prompt
            // had no way back to it, so they retyped it and lost its history.
            await loadSaved({
                success: true,
                data: { threadId: 'thread-9', priorRuns: 2, history: [] },
            });

            expect(screen.getByRole('textbox')).toHaveValue('deploy the mesh');
            expect(await screen.findByTestId('evaluation-thread-note')).toHaveTextContent(
                /2 earlier runs/i
            );
        });

        it('runs the NEXT evaluation in that same thread', async () => {
            // Which is what makes the delta compare against the version the
            // producer was happy with.
            const user = await loadSaved({
                success: true,
                data: { threadId: 'thread-9', priorRuns: 2, history: [] },
            });
            await screen.findByTestId('evaluation-thread-note');

            await user.click(screen.getByRole('button', { name: /try it out/i }));

            expect(mockRequest).toHaveBeenCalledWith('evaluate-prompt', {
                prompt: 'deploy the mesh',
                threadId: 'thread-9',
                promptId: 'saved-1',
            });
        });

        it('says plainly when a saved prompt has never been tried here', async () => {
            // Not an error — it simply starts its thread on the next run.
            await loadSaved({ success: true, data: { priorRuns: 0, history: [] } });

            expect(await screen.findByTestId('evaluation-thread-note')).toHaveTextContent(
                /not been tried out here/i
            );
        });

        it('START FRESH keeps the words and drops the past', async () => {
            // A fork. Without it the only way to start clean is to retype from
            // memory, which is exactly how history got lost.
            const user = await loadSaved({
                success: true,
                data: { threadId: 'thread-9', priorRuns: 2, history: [] },
            });
            await screen.findByTestId('evaluation-thread-note');

            await user.click(screen.getByRole('button', { name: /start fresh/i }));
            await user.click(screen.getByRole('button', { name: /try it out/i }));

            expect(screen.getByRole('textbox')).toHaveValue('deploy the mesh');
            expect(mockRequest).toHaveBeenCalledWith('evaluate-prompt', {
                prompt: 'deploy the mesh',
                threadId: undefined,
                promptId: undefined,
            });
        });
    });

    describe('saving to the library', () => {
        it('sends a real prompt entry, and anchors the runs already made', async () => {
            // The save used to send `{name, prompt}`, which the library handler
            // rejects as an invalid payload — silently, because the workbench
            // never read the answer. And anchoring only future runs would leave
            // the thread unreachable from the library until it was run again.
            const user = setupUser();
            respondByType({
                'list-ai-prompts': { success: true, aiPrompts: [] },
                'evaluate-prompt': verdictResponse({ threadId: 'thread-9' }),
                'save-ai-prompt': { success: true, aiPrompts: [] },
            });
            renderWorkbench();
            await user.type(screen.getByRole('textbox'), 'deploy the mesh');
            await user.click(screen.getByRole('button', { name: /try it out/i }));
            await screen.findByText(/nothing was changed/i);

            await user.click(screen.getByRole('button', { name: /save to library/i }));

            const saved = mockRequest.mock.calls.find((c) => c[0] === 'save-ai-prompt');
            expect(saved?.[1]).toEqual({
                prompt: {
                    id: expect.any(String),
                    title: 'deploy the mesh',
                    prompt: 'deploy the mesh',
                },
            });
            expect(mockRequest).toHaveBeenLastCalledWith('anchor-evaluation-thread', {
                threadId: 'thread-9',
                promptId: (saved?.[1] as { prompt: { id: string } }).prompt.id,
            });
        });
    });

    describe('the cheapest version', () => {
        it('offers a way back to it, because history keeps it on purpose', async () => {
            const user = await evaluateWith(
                verdictResponse({
                    costUSD: 0.4,
                    priorRuns: 3,
                    bestRun: {
                        prompt: 'the cheap wording',
                        costUSD: 0.09,
                        steps: 2,
                        wastedSteps: 0,
                        durationMs: 9000,
                        at: '2026-08-20T10:00:00.000Z',
                    },
                })
            );
            await screen.findByTestId('evaluation-best-run');

            await user.click(screen.getByRole('link', { name: /go back to it/i }));

            expect(screen.getByRole('textbox')).toHaveValue('the cheap wording');
        });

        it('does not offer it when this run IS the cheapest', async () => {
            await evaluateWith(
                verdictResponse({
                    costUSD: 0.09,
                    priorRuns: 3,
                    bestRun: {
                        prompt: 'deploy the mesh',
                        costUSD: 0.09,
                        steps: 2,
                        wastedSteps: 0,
                        durationMs: 9000,
                        at: '2026-08-20T10:00:00.000Z',
                    },
                })
            );
            await screen.findByText(/nothing was changed/i);

            expect(screen.queryByTestId('evaluation-best-run')).toBeNull();
        });
    });

    describe('showing what the agent already did', () => {
        /** A trace report shaped exactly as the handler returns it. */
        function traceReport(overrides: Record<string, unknown> = {}) {
            const row = {
                tool: 'get_current_project',
                outcome: 'ok',
                durationMs: 5,
                resultBytes: 20,
                at: 0,
            };
            return {
                success: true,
                data: {
                    rows: [row, { ...row, at: 10, flag: 'repeated' }],
                    standouts: [{ ...row, at: 10, flag: 'repeated' }],
                    totalCalls: 2,
                    wastedCalls: 1,
                    blockedCalls: 0,
                    failedCalls: 0,
                    ...overrides,
                },
            };
        }

        async function openTrace(report: unknown) {
            const user = setupUser();
            respondByType({
                'list-ai-prompts': { success: true, aiPrompts: [] },
                'get-agent-trace': report,
            });
            renderWorkbench();
            await user.click(screen.getByRole('button', { name: /what the agent did/i }));
            return user;
        }

        it('shows calls made through the ORDINARY chat, not only workbench runs', async () => {
            // The gap this closes: the recorder was capturing every chat and
            // nothing read it.
            await openTrace(traceReport());

            expect(await screen.findByTestId('trace-steps')).toHaveTextContent(
                'get_current_project',
            );
        });

        it('calls out the repeats rather than only listing them', async () => {
            await openTrace(traceReport());

            expect(await screen.findByTestId('trace-standouts')).toHaveTextContent(/asked again/i);
        });

        it('EXPLAINS the missing cost instead of showing zero', async () => {
            // Cost comes from a run's own output and we do not own the chat's
            // process. A zero would read as "this was free".
            await openTrace(traceReport());

            expect(await screen.findByTestId('trace-no-cost')).toHaveTextContent(
                /not recorded for a chat session/i,
            );
            expect(screen.queryByText(/\$0\.00/)).toBeNull();
        });

        it('says so when nothing has happened yet', async () => {
            await openTrace(
                traceReport({ rows: [], standouts: [], totalCalls: 0, wastedCalls: 0 }),
            );

            expect(await screen.findByTestId('trace-empty')).toHaveTextContent(
                /has not done anything yet/i,
            );
        });

        it('warns that the list is the WINDOW, not one conversation', async () => {
            // Two chats and a workbench run all write to the same recorder.
            // Presenting it as one conversation would be a lie.
            await openTrace(traceReport());

            expect(await screen.findByTestId('trace-summary')).toHaveTextContent(
                /window.*not one conversation/i,
            );
        });

        it('opens straight into the trace when the command asked for it', async () => {
            // Two commands, one panel. The mode arrives with the init payload on
            // a first open, and as a push when the panel is already there.
            respondByType({
                'list-ai-prompts': { success: true, aiPrompts: [] },
                'get-agent-trace': traceReport(),
            });
            renderWorkbench();

            pushMessage('workbench-mode', { mode: 'trace' });

            expect(await screen.findByTestId('trace-summary')).toBeInTheDocument();
        });
    });
});
