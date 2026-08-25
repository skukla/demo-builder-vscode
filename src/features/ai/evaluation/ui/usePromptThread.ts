/**
 * The thread the workbench is working in, and the library it loads from.
 *
 * A **thread** is one piece of work — "getting this prompt right". It is
 * DECLARED here, by the only surface that can know which it is: this hook starts
 * one on the first run, keeps it while the producer edits and re-runs, resumes
 * one when they load a saved prompt, and forks a new one when they say start
 * fresh. Nothing infers a thread from how similar two prompts look — a producer
 * has to be able to say why two runs belong together.
 *
 * It lives outside the component because it is the state, not the layout: the
 * component would otherwise be five `useState`s and four requests deep before
 * rendering anything.
 *
 * @module features/ai/evaluation/ui/usePromptThread
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiPrompt } from '@/types/base';
import type { ResumeThreadResponse } from '@/types/webviewRequests';

/** What `save-ai-prompt` and `list-ai-prompts` both answer with. */
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

/** A saved prompt's title, kept short enough to read in a picker. */
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
    savedPrompts: AiPrompt[];
    /** Load a saved prompt and resume whatever history it has here. */
    loadSaved: (promptId: string) => Promise<void>;
    /** Same text, new thread — a fork, deliberately. */
    startFresh: () => void;
    /** Save the current text to the library and anchor this thread to it. */
    saveToLibrary: () => Promise<AiPrompt | undefined>;
    /** Record the thread a completed run was filed under. */
    noteRun: (threadId: string, priorRuns: number) => void;
}

/**
 * Own the prompt text, the thread it belongs to, and the saved-prompt list.
 *
 * @returns everything the workbench needs to refine across sittings
 */
export function usePromptThread(seed: AiPrompt[] = []): PromptThread {
    const [prompt, setPrompt] = useState('');
    const [thread, setThread] = useState<ThreadState>(NO_THREAD);
    const [savedPrompts, setSavedPrompts] = useState<AiPrompt[]>(seed);

    // The MERGED list — pinned prompts live in global state and reach a webview
    // only through this handler, so the project prop alone shows a subset.
    useEffect(() => {
        let live = true;
        void (async () => {
            const response = await webviewClient.request<PromptListResponse>('list-ai-prompts');
            if (live && response?.success && Array.isArray(response.aiPrompts)) {
                setSavedPrompts(response.aiPrompts);
            }
        })();
        return () => {
            live = false;
        };
    }, []);

    const appendToPrompt = useCallback((append: string) => {
        // Appended, never replaced: the producer's words are theirs, and a
        // suggestion that rewrote the prompt would lose whatever it did not
        // understand.
        setPrompt((current) => `${current.trimEnd()}${append}`);
    }, []);

    const loadSaved = useCallback(
        async (promptId: string) => {
            const saved = savedPrompts.find((p) => p.id === promptId);
            if (!saved) return;
            setPrompt(saved.prompt);
            const response = await webviewClient.request<ResumeThreadResponse>(
                'resume-evaluation-thread',
                { promptId },
            );
            // A prompt with no runs here is normal, not a failure — it simply
            // starts its thread on the next run, anchored to this saved prompt.
            setThread({
                threadId: response?.success ? response.data?.threadId : undefined,
                promptId,
                priorRuns: response?.data?.priorRuns ?? 0,
            });
        },
        [savedPrompts],
    );

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
        if (Array.isArray(response.aiPrompts)) setSavedPrompts(response.aiPrompts);
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
        savedPrompts,
        loadSaved,
        startFresh,
        saveToLibrary,
        noteRun,
    };
}
