/**
 * askDuringOperation — a question goes where the SC is already looking.
 *
 * The bug it fixes was visible in one screenshot: republishing showed a progress
 * modal waiting on "Your DA.live sign-in" while a NOTIFICATION asked for that
 * sign-in. The pause-and-continue was right; the surface was wrong.
 *
 * So the assertions are about WHICH surface opened, and about the work carrying on
 * with the answer — not about the text, which `progress-wording` covers.
 */

import * as vscode from 'vscode';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { heldProgress, pushOperationProgress, startModalRun } from '@/core/vscode/operationProgress';
import {
    answerOperationPrompt,
    askDuringOperation,
    askForDetailsDuringOperation,
    handleAnswerOperationPrompt,
    isAwaitingAnswer,
    modalIsAsking,
    withModalAsking,
} from '@/core/vscode/operationPrompt';
import { createMockHandlerContext } from '../../helpers/handlerContextTestHelpers';

const showWarning = vscode.window.showWarningMessage as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
});

/** Let the question reach the screen before answering it. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('no modal is hosting the operation', () => {
    it('asks in a notification, exactly as before', async () => {
        showWarning.mockResolvedValue('Sign In');

        const answer = await askDuringOperation('Your DA.live session has expired.', 'Sign In');

        expect(showWarning).toHaveBeenCalledWith('Your DA.live session has expired.', 'Sign In');
        expect(answer).toBe('Sign In');
    });

    // An agent has no modal and no eyes on the notification. Without this its
    // narration simply stops, and the run reads as hung rather than waiting.
    it('tells an agent what the run is waiting for', async () => {
        showWarning.mockResolvedValue(undefined);
        const said: string[] = [];

        await withPhaseSinks([(line) => said.push(line)], () =>
            askDuringOperation('Your DA.live session has expired.', 'Sign In'),
        );

        expect(said).toEqual(['Your DA.live session has expired.']);
        expect(showWarning).toHaveBeenCalled();
    });
});

describe('a modal is hosting the operation', () => {
    it('asks in the modal and opens no notification', async () => {
        const send = jest.fn();
        startModalRun('op-1', send);

        const asking = withModalAsking('op-1', () =>
            askDuringOperation('Your DA.live session has expired.', 'Sign In'),
        );
        await settle();

        expect(showWarning).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({
                id: 'op-1',
                prompt: { message: 'Your DA.live session has expired.', actions: ['Sign In'] },
            }),
        );

        answerOperationPrompt('op-1', 'Sign In');
        await expect(asking).resolves.toBe('Sign In');
    });

    it('hands the answer back, so the work carries on with it', async () => {
        startModalRun('op-2', jest.fn());
        const steps: string[] = [];

        const run = withModalAsking('op-2', async () => {
            steps.push('checking');
            const chosen = await askDuringOperation('Sign in to continue.', 'Sign In', 'Cancel');
            steps.push(`answered:${chosen}`);
            return chosen;
        });
        await settle();
        answerOperationPrompt('op-2', 'Cancel');

        await expect(run).resolves.toBe('Cancel');
        expect(steps).toEqual(['checking', 'answered:Cancel']);
    });

    // Dismissing is an answer, not a silence: the guard reads undefined as cancelled.
    it('reads a dismissal as no answer', async () => {
        startModalRun('op-3', jest.fn());

        const asking = withModalAsking('op-3', () => askDuringOperation('Sign in?', 'Sign In'));
        await settle();
        answerOperationPrompt('op-3', undefined);

        await expect(asking).resolves.toBeUndefined();
    });

    it('puts the stage back once the question is answered', async () => {
        startModalRun('op-4', jest.fn());
        await pushOperationProgress({
            id: 'op-4',
            state: 'running',
            stage: 'Checking requirements',
            step: 'Your DA.live sign-in',
        });

        const asking = withModalAsking('op-4', () => askDuringOperation('Sign in?', 'Sign In'));
        await settle();
        expect(heldProgress('op-4')?.prompt).toBeDefined();

        answerOperationPrompt('op-4', 'Sign In');
        await asking;

        // The whole payload, not a subset: the question must be GONE from it, and a
        // subset assertion cannot tell an absent key from one it did not look at.
        expect(heldProgress('op-4')).toEqual({
            id: 'op-4',
            state: 'running',
            stage: 'Checking requirements',
            step: 'Your DA.live sign-in',
        });
    });

    // The Adobe sign-in guard races its prompt against a timeout, so a run CAN end
    // with a resolver still waiting. Left behind, the next run of the same operation
    // would be answered by a click meant for the dead one.
    it('forgets a question the work outlived', async () => {
        startModalRun('op-5', jest.fn());

        await withModalAsking('op-5', async () => {
            void askDuringOperation('Sign in?', 'Sign In');
            await settle();
            expect(isAwaitingAnswer('op-5')).toBe(true);
        });

        expect(isAwaitingAnswer('op-5')).toBe(false);
    });
});

describe('the handler behind the modal button', () => {
    it('answers the operation it names', async () => {
        startModalRun('op-6', jest.fn());
        const asking = withModalAsking('op-6', () => askDuringOperation('Sign in?', 'Sign In'));
        await settle();

        const result = await handleAnswerOperationPrompt(createMockHandlerContext(), {
            id: 'op-6',
            answer: 'Sign In',
        });

        expect(result).toEqual({ success: true });
        await expect(asking).resolves.toBe('Sign In');
    });

    it('refuses a request naming no operation', async () => {
        const result = await handleAnswerOperationPrompt(createMockHandlerContext(), {});

        expect(result).toEqual({ success: false, error: 'No operation id' });
    });
});

describe('a question that needs something typed', () => {
    it('sends the fields to the modal and returns what was typed', async () => {
        const send = jest.fn();
        startModalRun('op-7', send);

        const asking = withModalAsking('op-7', () =>
            askForDetailsDuringOperation({
                message: 'Sign in to DA.live.',
                fields: [
                    { id: 'orgName', label: 'DA.live namespace' },
                    { id: 'token', label: 'Token', secret: true },
                ],
                actions: ['Sign In', 'Open DA.live'],
            }),
        );
        await settle();

        expect(send).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({
                prompt: {
                    message: 'Sign in to DA.live.',
                    fields: [
                        { id: 'orgName', label: 'DA.live namespace' },
                        { id: 'token', label: 'Token', secret: true },
                    ],
                    actions: ['Sign In', 'Open DA.live'],
                },
            }),
        );

        answerOperationPrompt('op-7', 'Sign In', { orgName: 'acme', token: 'eyJabc' });

        await expect(asking).resolves.toEqual({
            action: 'Sign In',
            values: { orgName: 'acme', token: 'eyJabc' },
        });
    });

    // A form has no notification equivalent, so the caller keeps its input-box flow
    // for that case and asks first.
    it('says whether a modal is there to ask it', async () => {
        expect(modalIsAsking()).toBe(false);

        await withModalAsking('op-8', async () => {
            expect(modalIsAsking()).toBe(true);
        });
    });

    it('answers nothing when no modal is hosting the work', async () => {
        const answer = await askForDetailsDuringOperation({
            message: 'Sign in to DA.live.',
            fields: [{ id: 'token', label: 'Token' }],
            actions: ['Sign In'],
        });

        expect(answer).toEqual({ action: undefined, values: {} });
        expect(showWarning).not.toHaveBeenCalled();
    });
});
