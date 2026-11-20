/**
 * A failed creation step pauses the run until the SC fixes it or skips it (F307).
 *
 * The pause is driven for real: the wizard's answer arrives through the same handler the
 * creation screen's buttons post to, and the run's limit is the real one. Only VS Code is
 * faked (its jest mock), for Fix with AI and the agent's modal.
 */

import * as vscode from 'vscode';
import { startCreationLimit } from '@/features/project-creation/handlers/creationLimit';
import {
    CHECK_AGAIN,
    RETRY,
    RUN_ONCE,
    SKIP_STEP,
    caught,
    creationFixPrompt,
    handleCreationPauseAnswer,
    untilDone,
    type PauseDeps,
} from '@/features/project-creation/handlers/creationPause';
import type { StepFailure } from '@/features/project-creation/services/stepFailure';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { CreationPause } from '@/types/webview';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

const FAILED: StepFailure = {
    reason: 'A category already uses this web address.',
    retryable: false,
};

/** A wizard run: a panel is open, so the creation screen asks. */
function wizardRun(signal?: AbortSignal): {
    deps: PauseDeps;
    shown: Array<CreationPause | undefined>;
} {
    const shown: Array<CreationPause | undefined> = [];
    const context = createMockHandlerContext({ panel: createMockWebviewPanel({ visible: true }) });
    const deps: PauseDeps = {
        context,
        reporter: { pause: (pause) => shown.push(pause) },
        signal,
        projectName: 'Release Test',
        step: 'Installing the datapack',
    };
    return { deps, shown };
}

/** A step that fails `times` times, then passes. */
function failingStep(times: number, failure: StepFailure = FAILED): jest.Mock {
    let left = times;
    return jest.fn(async () => {
        if (left === 0) return undefined;
        left -= 1;
        return failure;
    });
}

/** Wait until the run is waiting for an answer, then press `answer` as the screen does. */
async function press(context: HandlerContext, answer: string): Promise<void> {
    for (let i = 0; i < 100 && !context.sharedState.creationPauseAnswer; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    await expect(handleCreationPauseAnswer(context, { answer })).resolves.toEqual({
        success: true,
    });
}

beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
});

describe('untilDone in the wizard', () => {
    it('runs a step that passes once, and shows no pause', async () => {
        const { deps, shown } = wizardRun();
        const step = failingStep(0);

        await untilDone(deps, step);

        expect(step).toHaveBeenCalledTimes(1);
        expect(shown).toStrictEqual([]);
    });

    it('pauses on a failure, runs the step again on Check Again, and carries on once it passes', async () => {
        const { deps, shown } = wizardRun();
        const step = failingStep(1);

        const run = untilDone(deps, step);
        await press(deps.context, CHECK_AGAIN);
        await run;

        expect(step).toHaveBeenCalledTimes(2);
        expect(shown).toEqual([
            { reason: FAILED.reason, actions: ['Fix with AI', CHECK_AGAIN], canSkip: false },
            undefined,
        ]);
        expect(deps.context.sharedState.creationPauseAnswer).toBeUndefined();
    });

    it('offers Skip This Step only once a fix attempt has failed too, then goes on without the step', async () => {
        const { deps, shown } = wizardRun();
        const step = failingStep(5);

        const run = untilDone(deps, step);
        await press(deps.context, CHECK_AGAIN);
        await press(deps.context, SKIP_STEP);
        await run;

        expect(step).toHaveBeenCalledTimes(2);
        expect(shown.filter(Boolean).map((pause) => pause?.canSkip)).toStrictEqual([false, true]);
    });

    it('ignores a skip before a fix attempt, and keeps waiting', async () => {
        const { deps } = wizardRun();
        const step = failingStep(1);

        const run = untilDone(deps, step);
        await press(deps.context, SKIP_STEP);
        await press(deps.context, CHECK_AGAIN);
        await run;

        expect(step).toHaveBeenCalledTimes(2);
    });

    it('offers Retry for a failure a retry can help, then Fix with AI once two retries failed', async () => {
        const { deps, shown } = wizardRun();
        const step = failingStep(3, { reason: 'The request timed out', retryable: true });

        const run = untilDone(deps, step);
        await press(deps.context, RETRY);
        await press(deps.context, RETRY);
        await press(deps.context, CHECK_AGAIN);
        await run;

        expect(shown.filter(Boolean).map((p) => p?.actions)).toEqual([
            [RETRY],
            [RETRY],
            ['Fix with AI', CHECK_AGAIN],
        ]);
    });

    it('opens the AI on Fix with AI, naming the project, the step and the reason, and keeps waiting', async () => {
        const { deps } = wizardRun();
        const step = failingStep(1);

        const run = untilDone(deps, step);
        await press(deps.context, 'Fix with AI');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.openInClaude', {
            prompt: creationFixPrompt('Release Test', 'Installing the datapack', FAILED.reason),
            fresh: true,
        });
        expect(step).toHaveBeenCalledTimes(1);

        await press(deps.context, CHECK_AGAIN);
        await run;
        expect(step).toHaveBeenCalledTimes(2);
    });

    it('ends with the cancelled error when the run is stopped while it waits', async () => {
        const controller = new AbortController();
        const { deps } = wizardRun(controller.signal);

        const run = untilDone(deps, failingStep(1));
        for (let i = 0; i < 100 && !deps.context.sharedState.creationPauseAnswer; i++) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        controller.abort();

        await expect(run).rejects.toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it('holds the run limit while it waits, and counts again once answered', async () => {
        const controller = new AbortController();
        const limit = startCreationLimit(60_000, 'Project creation', controller.signal);
        const hold = jest.spyOn(limit, 'hold');
        const release = jest.spyOn(limit, 'release');
        const { deps } = wizardRun(controller.signal);

        const run = untilDone(deps, failingStep(1));
        await press(deps.context, CHECK_AGAIN);
        await run;
        limit.stop();

        expect(hold).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
    });
});

describe('untilDone under an agent', () => {
    it('tells the agent the step, why and its answers, leaving Fix with AI out, and runs again on its answer', async () => {
        const { deps } = wizardRun();
        deps.context.panel = undefined;
        const heard: unknown[] = [];
        deps.context.sharedState.onCreationPause = (pause) => heard.push(pause);
        const step = failingStep(1);

        const run = untilDone(deps, step);
        await press(deps.context, CHECK_AGAIN);
        await run;

        expect(heard).toStrictEqual([
            { reason: FAILED.reason, actions: [CHECK_AGAIN], canSkip: false, step: 'Installing the datapack' },
        ]);
        expect(step).toHaveBeenCalledTimes(2);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('waits on for a skip a step that cannot be skipped', async () => {
        const { deps } = wizardRun();
        deps.context.panel = undefined;
        deps.context.sharedState.onCreationPause = () => undefined;
        const step = failingStep(1);

        const run = untilDone({ ...deps, canSkip: false }, step);
        await press(deps.context, SKIP_STEP);
        await press(deps.context, CHECK_AGAIN);
        await run;

        expect(step).toHaveBeenCalledTimes(2);
    });

    it('does not wait when nobody can answer: a reported failure goes by, a thrown one ends the run', async () => {
        const { deps } = wizardRun();
        deps.context.panel = undefined;
        const error = new Error('mesh failed');

        await expect(untilDone(deps, failingStep(5))).resolves.toBeUndefined();
        await expect(untilDone(deps, caught(() => Promise.reject(error)))).rejects.toBe(error);
    });
});

describe('caught — a step that throws, read as one that fails', () => {
    it('turns the error into the failure the run pauses on, the error kept', async () => {
        const error = new Error('The request timed out');

        await expect(caught(() => Promise.reject(error))()).resolves.toStrictEqual({
            reason: 'The request timed out',
            retryable: true,
            error,
        });
    });

    it('lets a stopped run end, rather than pausing it', async () => {
        const stopped = Object.assign(new Error('cancelled'), { code: ErrorCode.CANCELLED });

        await expect(caught(() => Promise.reject(stopped))()).rejects.toBe(stopped);
    });
});

describe('RUN_ONCE — where nothing can pause', () => {
    it('ends with the error a step threw', async () => {
        const error = new Error('mesh failed');

        await expect(RUN_ONCE('Deploying the mesh', caught(() => Promise.reject(error)))).rejects.toBe(error);
    });

    it('goes on past a failure the step only reported, as before', async () => {
        await expect(RUN_ONCE('Installing the datapack', async () => FAILED)).resolves.toBeUndefined();
    });
});

describe('handleCreationPauseAnswer', () => {
    it('refuses when no creation is waiting', async () => {
        const context = createMockHandlerContext();

        await expect(handleCreationPauseAnswer(context, { answer: CHECK_AGAIN })).resolves.toEqual({
            success: false,
            error: 'No creation is waiting for an answer.',
        });
    });
});
