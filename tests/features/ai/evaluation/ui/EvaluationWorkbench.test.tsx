/**
 * The Prompt Workbench: simulate a prompt, read the verdict, apply a fix, again.
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
    step,
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
        await user.click(screen.getByRole('button', { name: /^simulate$/i }));
        return user;
    }

    it('will not run an empty prompt', async () => {
        renderWorkbench();

        expect(screen.getByRole('button', { name: /^simulate$/i })).toBeDisabled();
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

        // Rendered as "↓ from $0.21" — the arrow is what the plan's sketch drew
        // and what reads at a glance; the word is on `aria-label` for anyone who
        // cannot see the glyph, and that is what this asserts.
        expect(await screen.findByLabelText(/down from \$0\.21/i)).toBeInTheDocument();
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

    describe('the transcript', () => {
        it('says what each step DID, never the raw tool name on the band', async () => {
            // The defect this replaced: `1. get_current_project — 5ms`, while
            // 103 authored phrases sat in toolNarration.ts unimported.
            await evaluateWith(verdictResponse());

            const bands = await screen.findAllByTestId('transcript-phase');
            expect(bands[0]).toHaveTextContent(/checking which project is open/i);
            expect(bands[0]).not.toHaveTextContent('get_current_project');
        });

        it('keeps the tool name for the reader who opens the phase', async () => {
            // Plain English on the band, identifiers underneath — "unless they
            // ask for it" is the rule, not "never".
            await evaluateWith(verdictResponse());

            const steps = await screen.findAllByTestId('transcript-step');
            expect(steps[0]).toHaveTextContent('get_current_project');
        });

        it('folds consecutive calls of the SAME tool into ONE band', async () => {
            // Eleven lines is a log; three bands is a story.
            await evaluateWith(
                verdictResponse({
                    trace: [
                        step('check_mesh', 'ok', 0),
                        step('check_mesh', 'ok', 10),
                        step('check_mesh', 'ok', 20),
                        step('deploy_mesh', 'blocked-by-dry-run', 30),
                    ],
                })
            );

            const bands = await screen.findAllByTestId('transcript-phase');
            expect(bands).toHaveLength(2);
            expect(bands[0]).toHaveTextContent(/checking the api mesh/i);
            expect(bands[0]).toHaveTextContent('3 steps');
        });

        it('says a phase FAILED on the band, without it being expanded', async () => {
            // "Did something go wrong" is what a producer scans for, and
            // opening eleven bands to find out is not scanning.
            await evaluateWith(
                verdictResponse({ trace: [step('check_mesh', 'error', 0)], repeats: [] })
            );

            const bands = await screen.findAllByTestId('transcript-phase');
            expect(bands[0]).toHaveTextContent(/failed/i);
        });

        it('marks a blocked write SIMULATED in the transcript, not only in a summary', async () => {
            await evaluateWith(
                verdictResponse({ trace: [step('deploy_mesh', 'blocked-by-dry-run', 0)] })
            );

            const bands = await screen.findAllByTestId('transcript-phase');
            expect(bands[0]).toHaveTextContent(/simulated — nothing changed/i);
        });

        it("shows the agent's own reply, which used to be thrown away", async () => {
            // The CLI returns it beside the cost fields. Capturing it is what
            // turns a log of tool calls into a conversation.
            await evaluateWith(verdictResponse());

            expect(await screen.findByTestId('evaluation-reply')).toHaveTextContent(
                /I would deploy the mesh/i
            );
        });

        it('renders the transcript fine when the run returned no reply', async () => {
            // A "Claude" heading over nothing would read as a reply that failed
            // to load, so the turn is omitted rather than emptied.
            await evaluateWith(verdictResponse({ reply: undefined }));

            await screen.findByText(/nothing was changed/i);
            expect(screen.queryByTestId('evaluation-reply')).toBeNull();
            expect(screen.getAllByTestId('transcript-phase').length).toBeGreaterThan(0);
        });

        it('quotes the prompt back as the producer wrote it', async () => {
            await evaluateWith(verdictResponse());

            expect(await screen.findByTestId('evaluation-prompt-turn')).toHaveTextContent(
                'deploy the mesh'
            );
        });

        it('says so plainly when the agent used no Demo Builder tools at all', async () => {
            // A real answer, not an empty state: it worked it out without
            // asking us anything.
            await evaluateWith(verdictResponse({ trace: [], repeats: [], blocked: [] }));

            expect(await screen.findByTestId('transcript-no-steps')).toHaveTextContent(
                /did not use any Demo Builder tools/i
            );
        });
    });

    describe('the ambient view shows LESS, on purpose', () => {
        it('has no speaker turns and no cost, because we do not own that process', async () => {
            const user = setupUser();
            respondByType({
                'get-agent-trace': {
                    success: true,
                    data: {
                        rows: [step('get_current_project', 'ok', 0)],
                        standouts: [],
                        totalCalls: 1,
                        wastedCalls: 0,
                        blockedCalls: 0,
                        failedCalls: 0,
                    },
                },
            });
            renderWorkbench();
            await user.click(screen.getByRole('button', { name: /what the agent did/i }));
            await screen.findByTestId('trace-steps');

            // Same bands as a run…
            expect(screen.getAllByTestId('transcript-phase').length).toBeGreaterThan(0);
            // …and none of what a run has that this cannot honestly have.
            expect(screen.queryByTestId('evaluation-prompt-turn')).toBeNull();
            expect(screen.queryByTestId('evaluation-reply')).toBeNull();
            expect(screen.queryByText(/\$\d/)).toBeNull();
        });
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
            expect(screen.getByRole('button', { name: /simulate again/i })).toHaveAttribute(
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
        /**
         * A prompt arrives from the LIBRARY, not from a picker in this panel.
         *
         * The saved-prompt dropdown that used to live here duplicated the
         * Prompt Library's entire job, and it is gone: the library picks, the
         * terminal runs, the workbench measures.
         */
        function handOver(resume: unknown) {
            const user = setupUser();
            respondByType({
                'resume-evaluation-thread': resume,
                'evaluate-prompt': verdictResponse({ threadId: 'thread-9' }),
            });
            renderWorkbench({}, { initialPrompt: SAVED_PROMPT });
            return user;
        }

        it('has no picker of its own — the library is the picker', () => {
            renderWorkbench();

            expect(screen.queryByRole('combobox')).toBeNull();
            // And it does not even ask for the list any more.
            expect(mockRequest).not.toHaveBeenCalledWith('list-ai-prompts', expect.anything());
        });

        it('fills the box from the library and says where it left off', async () => {
            // The missing half of the loop: a producer who saved a good prompt
            // had no way back to it, so they retyped it and lost its history.
            handOver({
                success: true,
                data: { threadId: 'thread-9', priorRuns: 2, history: [] },
            });

            expect(screen.getByRole('textbox')).toHaveValue('deploy the mesh');
            expect(await screen.findByTestId('evaluation-thread-note')).toHaveTextContent(
                /2 earlier runs/i
            );
        });

        it('also takes a prompt PUSHED to a workbench that is already open', async () => {
            // Init data arrives once. A producer with the panel already open who
            // picks "Open in workbench" on a card must still land on that
            // prompt, so the opening travels as a push too.
            respondByType({
                'resume-evaluation-thread': {
                    success: true,
                    data: { threadId: 'thread-9', priorRuns: 2, history: [] },
                },
            });
            renderWorkbench();

            pushMessage('workbench-open', { mode: 'prompt', prompt: SAVED_PROMPT });

            expect(await screen.findByTestId('evaluation-thread-note')).toHaveTextContent(
                /2 earlier runs/i
            );
            expect(screen.getByRole('textbox')).toHaveValue('deploy the mesh');
        });

        it('runs the NEXT evaluation in that same thread', async () => {
            // Which is what makes the delta compare against the version the
            // producer was happy with.
            const user = handOver({
                success: true,
                data: { threadId: 'thread-9', priorRuns: 2, history: [] },
            });
            await screen.findByTestId('evaluation-thread-note');

            await user.click(screen.getByRole('button', { name: /^simulate$/i }));

            expect(mockRequest).toHaveBeenCalledWith('evaluate-prompt', {
                prompt: 'deploy the mesh',
                threadId: 'thread-9',
                promptId: 'saved-1',
            });
        });

        it('says plainly when a saved prompt has never been simulated here', async () => {
            // Not an error — it simply starts its thread on the next run.
            handOver({ success: true, data: { priorRuns: 0, history: [] } });

            expect(await screen.findByTestId('evaluation-thread-note')).toHaveTextContent(
                /not been simulated here/i
            );
        });

        it('START FRESH keeps the words and drops the past', async () => {
            // A fork. Without it the only way to start clean is to retype from
            // memory, which is exactly how history got lost.
            const user = handOver({
                success: true,
                data: { threadId: 'thread-9', priorRuns: 2, history: [] },
            });
            await screen.findByTestId('evaluation-thread-note');

            await user.click(screen.getByRole('link', { name: /start fresh/i }));
            await user.click(screen.getByRole('button', { name: /^simulate$/i }));

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
                'evaluate-prompt': verdictResponse({ threadId: 'thread-9' }),
                'save-ai-prompt': { success: true, aiPrompts: [] },
            });
            renderWorkbench();
            await user.type(screen.getByRole('textbox'), 'deploy the mesh');
            await user.click(screen.getByRole('button', { name: /^simulate$/i }));
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
            respondByType({ 'get-agent-trace': report });
            renderWorkbench();
            await user.click(screen.getByRole('button', { name: /what the agent did/i }));
            return user;
        }

        it('shows calls made through the ORDINARY chat, not only workbench runs', async () => {
            // The gap this closes: the recorder was capturing every chat and
            // nothing read it.
            await openTrace(traceReport());

            // In PLAIN ENGLISH, with the raw tool name kept for the reader
            // who opens the phase — the defect this replaced was the list of
            // raw names with no words at all.
            const steps = await screen.findByTestId('trace-steps');
            expect(steps).toHaveTextContent(/checking which project is open/i);
            expect(steps).toHaveTextContent('get_current_project');
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
            respondByType({ 'get-agent-trace': traceReport() });
            renderWorkbench();

            pushMessage('workbench-open', { mode: 'trace' });

            expect(await screen.findByTestId('trace-summary')).toBeInTheDocument();
        });
    });
});
