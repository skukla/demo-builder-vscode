/**
 * What the storefront setup tells the wizard while it runs: a STEP from the stage table
 * on line 1, numbered "(n of N)" from a list known before the run starts, what it is
 * doing now on line 2, and the run's start for the screen's clock (progress vocabulary
 * slice 4, owner 2026-10-16).
 *
 * WHY: the setup's own messages were line 1 ("Creating GitHub repository from
 * template", "Copying the content: 40 of 103 files"), so the step changed with every
 * line, a count stood where the step should be, and the same work had different names
 * here and in Reset. The setup runs the same content pipeline Reset does; for that part
 * it shows Reset's steps.
 *
 * One wrapper over the run's channel ({@link withSetupSteps}) turns every progress push
 * into that shape, so the phases keep saying what they do and none has to know its own
 * number. The steps come from the push's phase, or from a step the push names where
 * the phase alone would mislead (the existing repository's AEM Code Sync check runs in
 * the repository step but has always reported the code phase).
 *
 * The pipeline's progress mapping moved here from `storefrontSetupPhases.ts`, which sat
 * at its size limit.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupProgress
 */

import { stepPosition } from '@/core/utils/numberedSteps';
import { OPERATION_STAGES as S, detailFor } from '@/core/utils/operationStages';
import { PIPELINE_RESET_STAGE, RESET_STAGES } from '@/core/utils/resetStages';
import { stepUnder } from '@/core/utils/stageLine';
import type { HandlerContext } from '@/types/handlers';
import type {
    StorefrontSetupProgressPayload,
    StorefrontSetupProgressPhase,
} from '@/types/webviewPayloads';

const PROGRESS = 'storefront-setup-progress';

/** The step each working phase belongs to; the pipeline's pushes name theirs. */
const PHASE_STEP: Partial<Record<StorefrontSetupProgressPhase, string>> = {
    repository: S.settingUpRepository.label,
    'storefront-code': S.settingUpCode.label,
    'code-sync': S.publishingCodeAndSettings.label,
    'site-config': S.publishingCodeAndSettings.label,
    content: S.copyingContent.label,
    'block-library': S.settingUpAuthoring.label,
    publish: S.publishingPages.label,
};

/**
 * Every step a storefront setup will report, in order.
 *
 * ORDER IS LOAD-BEARING: a step's number is its index here, so the list follows
 * `executeStorefrontSetupPhases` and the pipeline it runs. A step with nothing to do
 * (no publishable pages, no code paths to check) is skipped and the count moves on.
 * Warming product pages is not listed: the wizard's setup runs before its project
 * exists, so it never warms them; when one does (a setup from a project's own screen),
 * it shows without a number.
 *
 * @param run - whether this setup clears the site's old content, and whether it copies
 * @returns the step names
 */
export function storefrontSetupSteps(run: {
    clearsContent: boolean;
    copiesContent: boolean;
}): string[] {
    const { clearsContent, copiesContent } = run;
    return [
        S.settingUpRepository.label,
        S.settingUpCode.label,
        S.publishingCodeAndSettings.label,
        ...(clearsContent ? [S.clearingOldContent.label] : []),
        ...(copiesContent ? [S.copyingContent.label] : []),
        S.settingUpAuthoring.label,
        S.publishingPages.label,
        ...(clearsContent && copiesContent ? [S.removingOldPages.label] : []),
        ...(copiesContent ? [S.checkingCopiedPages.label] : []),
    ];
}

/** One push in the step shape: the step, its number, the line under it, the run's start. */
function asStep(
    data: StorefrontSetupProgressPayload,
    steps: readonly string[],
    startedAt: number,
): StorefrontSetupProgressPayload {
    const stage = data.stage ?? PHASE_STEP[data.phase];
    if (!stage) return data;
    const { subMessage, ...rest } = data;
    const position = stepPosition(steps, stage);
    return {
        ...rest,
        stage,
        ...(position ? { position } : {}),
        // Said once: a line that repeats the step keeps what follows it; one that is
        // only the step shows the push's detail (usually the repository), or the
        // step's own from the table.
        message: stepUnder(stage, data.message) ?? subMessage ?? detailFor(stage) ?? '',
        startedAt,
    };
}

/**
 * The run's channel, with every progress push in the step shape. Everything else the
 * run sends passes through as it was.
 *
 * @param context - the run's handler context
 * @param steps - every step the run will report ({@link storefrontSetupSteps})
 * @param startedAt - when the run began
 * @returns the context the phases run with
 */
export function withSetupSteps(
    context: HandlerContext,
    steps: readonly string[],
    startedAt: number = Date.now(),
): HandlerContext {
    return {
        ...context,
        sendMessage: (type: string, data?: unknown) =>
            context.sendMessage(
                type,
                type === PROGRESS
                    ? asStep(data as StorefrontSetupProgressPayload, steps, startedAt)
                    : data,
            ),
    };
}

/**
 * The run paused for a DA.live sign-in: the one push with no step, so the screen shows
 * the request itself and what it is waiting on. Both of the run's retries send it.
 */
export function sendSessionExpired(context: HandlerContext): Promise<void> {
    return context.sendMessage(PROGRESS, {
        phase: 'auth-recovery',
        message: 'DA.live session expired. Please re-authenticate to continue.',
        progress: -1,
    } satisfies StorefrontSetupProgressPayload);
}

/** What the content pipeline reports (`executeEdsPipeline`'s callback). */
export type PipelineProgressInfo = {
    operation: string;
    message: string;
    subMessage?: string;
    percentage?: number;
    current?: number;
    total?: number;
};

const PIPELINE_PROGRESS = {
    CONTENT_CLEAR: 49,
    CONTENT_COPY_START: 50,
    CONTENT_COPY_END: 58, // 50 + 8 (0.08 × 100)
    BLOCK_LIBRARY: 59,
    EDS_SETTINGS: 63,
    CACHE_PURGE: 66,
    CONTENT_PUBLISH_START: 67,
    CONTENT_PUBLISH_END: 94, // 67 + 27
    LIBRARY_PUBLISH: 95, // after content-publish completes — must be > CONTENT_PUBLISH_END (94)
} as const;

const PIPELINE_PHASE: Record<string, { phase: StorefrontSetupProgressPhase; progress: number }> = {
    'content-clear': { phase: 'content', progress: PIPELINE_PROGRESS.CONTENT_CLEAR },
    'content-copy': { phase: 'content', progress: PIPELINE_PROGRESS.CONTENT_COPY_START },
    'block-library': { phase: 'block-library', progress: PIPELINE_PROGRESS.BLOCK_LIBRARY },
    'eds-settings': { phase: 'block-library', progress: PIPELINE_PROGRESS.EDS_SETTINGS },
    'cache-purge': { phase: 'publish', progress: PIPELINE_PROGRESS.CACHE_PURGE },
    'content-publish': { phase: 'publish', progress: PIPELINE_PROGRESS.CONTENT_PUBLISH_START },
    'sheet-publish': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
    'library-publish': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
    'leftover-pages': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
    'page-check': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
    'catalog-prewarm': { phase: 'publish', progress: PIPELINE_PROGRESS.LIBRARY_PUBLISH },
};

/** Where on the 0-100 bar a pipeline push lands; two operations spread across a band. */
function barPosition(info: PipelineProgressInfo, start: number): number {
    if (info.operation === 'content-copy' && info.percentage !== undefined) {
        return PIPELINE_PROGRESS.CONTENT_COPY_START + Math.round(info.percentage * 0.08);
    }
    if (info.operation === 'content-publish' && info.current !== undefined && info.total) {
        const start = PIPELINE_PROGRESS.CONTENT_PUBLISH_START;
        const span = PIPELINE_PROGRESS.CONTENT_PUBLISH_END - start;
        return start + Math.round((info.current / info.total) * span);
    }
    return start;
}

/**
 * The content pipeline's progress callback: each operation under Reset's step for the
 * same work, its wizard phase, and its place on the bar.
 *
 * @param context - the run's (wrapped) handler context
 * @returns the callback `executeEdsPipeline` is handed
 */
export function buildPipelineProgressCallback(
    context: HandlerContext,
): (info: PipelineProgressInfo) => void {
    return (info) => {
        // Fallback for an operation the mapping doesn't know. It used to push the raw
        // operation string as the phase — a value outside the phase vocabulary that
        // the webview's bookkeeping silently ignored.
        const m = PIPELINE_PHASE[info.operation] ?? {
            phase: 'content' as const,
            progress: PIPELINE_PROGRESS.CONTENT_COPY_START,
        };
        const resetStep = PIPELINE_RESET_STAGE[info.operation];
        void context.sendMessage(PROGRESS, {
            phase: m.phase,
            ...(resetStep ? { stage: RESET_STAGES[resetStep].label } : {}),
            message: info.message,
            subMessage: info.subMessage,
            progress: barPosition(info, m.progress),
        } satisfies StorefrontSetupProgressPayload);
    };
}
