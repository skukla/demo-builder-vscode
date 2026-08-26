/**
 * The thread the workbench is working in.
 *
 * A **thread** is one piece of work — "getting this prompt right". It is
 * DECLARED here, by the only surface that can know which it is: this hook starts
 * one on the first run, keeps it while the producer edits and re-runs, resumes
 * one when a saved prompt is handed to the workbench, and forks a new one when
 * they say start fresh. Nothing infers a thread from how similar two prompts
 * look — a producer has to be able to say why two runs belong together.
 *
 * It lives outside the component because it is the state, not the layout: the
 * component would otherwise be four `useState`s and three requests deep before
 * rendering anything.
 *
 * ## The picker that used to live here, and why it is gone
 *
 * This hook once owned a LIST of saved prompts and a `loadSaved(id)` to choose
 * from it, which the workbench rendered as a `Picker`. That duplicated the
 * Prompt Library's entire job — a second, worse picker beside the one that
 * already works — and it went in because the workbench was designed as if the
 * library did not exist.
 *
 * Each surface does one thing: **the library PICKS, the terminal RUNS, the
 * workbench MEASURES.** So a prompt now arrives from OUTSIDE, handed over by the
 * library's "Open in workbench", and the workbench's own door opens it empty.
 * What is kept is everything the library cannot know: which thread this is, resuming its
 * history, forking it, and saving back.
 *
 * @module features/ai/evaluation/ui/usePromptThread
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiPrompt } from '@/types/base';
import type { ResumeThreadResponse } from '@/types/webviewRequests';

/** What `save-ai-prompt` answers with. */
interface PromptListResponse {
    success: boolean;
    aiPrompts?: AiPrompt[];
}

/** How far into a thread the workbench is, before this sitting's first run. */
export interface ThreadState {
    /** Undefined until the first run of a new thread mints one. */
    threadId?: string;
    /** Set when the thread was started from, or saved to, the library. */
    promptId?: string;
    /** Runs already in this thread. 0 for a fresh one. */
    priorRuns: number;
}

const NO_THREAD: ThreadState = { priorRuns: 0 };

/**
 * An id nothing else will collide with.
 *
 * Threads carry no meaning in their id — it only has to be unique within one
 * project's manifest. Mirrors the Prompt Library's own generator rather than
 * inventing a second scheme.
 */
function newId(prefix: string): string {
    const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return `${prefix}-${cryptoApi.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/** A saved prompt's title, kept short enough to read in the library's card. */
function titleFor(prompt: string): string {
    const firstLine = prompt.trim().split('\n')[0];
    return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

export interface PromptThread {
    prompt: string;
    setPrompt: (next: string) => void;
    /** Append to what the producer wrote — never replace it. */
    appendToPrompt: (append: string) => void;
    thread: ThreadState;
    /** Same text, new thread — a fork, deliberately. */
    startFresh: () => void;
    /** Save the current text to the library and anchor this thread to it. */
    saveToLibrary: () => Promise<AiPrompt | undefined>;
    /** Record the thread a completed run was filed under. */
    noteRun: (threadId: string, priorRuns: number) => void;
}

/**
 * Own the prompt text and the thread it belongs to.
 *
 * @param handedOver - a prompt sent from the Prompt Library's "Open in workbench",
 *   whose history is resumed on arrival. Undefined when the workbench was
 *   opened from its own door, which starts empty.
 * @returns everything the workbench needs to refine across sittings
 */
export function usePromptThread(handedOver?: AiPrompt): PromptThread {
    const [prompt, setPrompt] = useState(handedOver?.prompt ?? '');
    const [thread, setThread] = useState<ThreadState>(NO_THREAD);

    const handedOverId = handedOver?.id;
    const handedOverText = handedOver?.prompt;

    // Resume whatever runs this saved prompt already has here, so the next
    // result compares against the version the producer was happy with. A prompt
    // with no runs is NORMAL, not a failure — it simply starts its thread on the
    // next run, anchored to this saved prompt.
    useEffect(() => {
        if (!handedOverId) return undefined;
        let live = true;
        setPrompt(handedOverText ?? '');
        void (async () => {
            const response = await webviewClient.request<ResumeThreadResponse>(
                'resume-evaluation-thread',
                { promptId: handedOverId },
            );
            if (!live) return;
            setThread({
                threadId: response?.success ? response.data?.threadId : undefined,
                promptId: handedOverId,
                priorRuns: response?.data?.priorRuns ?? 0,
            });
        })();
        return () => {
            live = false;
        };
    }, [handedOverId, handedOverText]);

    const appendToPrompt = useCallback((append: string) => {
        // Appended, never replaced: the producer's words are theirs, and a
        // suggestion that rewrote the prompt would lose whatever it did not
        // understand.
        setPrompt((current) => `${current.trimEnd()}${append}`);
    }, []);

    const startFresh = useCallback(() => {
        // The TEXT stays. Wanting a clean comparison from the same starting
        // point is the common case; retyping from memory is what producers did
        // instead, and it is how history got lost.
        setThread(NO_THREAD);
    }, []);

    const saveToLibrary = useCallback(async (): Promise<AiPrompt | undefined> => {
        const body = prompt.trim();
        if (!body) return undefined;
        // Update the prompt in place when this thread already came from the
        // library, so refining a saved prompt does not litter it with copies.
        const entry: AiPrompt = {
            id: thread.promptId ?? newId('ai-prompt'),
            title: titleFor(body),
            prompt: body,
        };
        const response = await webviewClient.request<PromptListResponse>('save-ai-prompt', {
            prompt: entry,
        });
        if (!response?.success) return undefined;
        // Stamp the runs already in this thread, not just the ones to come.
        // Saving happens AFTER the refining, so anchoring only future runs would
        // leave the thread unreachable from the library until it was run again —
        // the exact journey this feature exists for.
        if (thread.threadId) {
            await webviewClient.request('anchor-evaluation-thread', {
                threadId: thread.threadId,
                promptId: entry.id,
            });
        }
        setThread((current) => ({ ...current, promptId: entry.id }));
        return entry;
    }, [prompt, thread.promptId, thread.threadId]);

    const noteRun = useCallback((threadId: string, priorRuns: number) => {
        setThread((current) => ({ ...current, threadId, priorRuns }));
    }, []);

    return {
        prompt,
        setPrompt,
        appendToPrompt,
        thread,
        startFresh,
        saveToLibrary,
        noteRun,
    };
}
