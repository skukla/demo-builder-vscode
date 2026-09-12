/**
 * useAddDemoFlow — the "Add a demo" dialog's state: the draft, the probe, the
 * add commit. Backend calls happen at the two commitment points only
 * (`docs/patterns/selection-pattern.md`): Continue off the link stage probes;
 * "Add demo" keeps a copy when asked and remembers the row. Typing and
 * ticking never talk to the host.
 *
 * @module features/project-creation/ui/components/add-demo/useAddDemoFlow
 */

import { useCallback, useState } from 'react';
import {
    buildAddedDemo,
    continueLabel as continueLabelFor,
    INITIAL_DRAFT,
    isBuildable,
    kindMatches,
    type AddDemoDraft,
    type AddDemoMode,
    type AddDemoStage,
} from './addDemoFlow';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo, StorefrontKind } from '@/types/projectFile';
import type {
    AddSharedDemoRequest,
    AddSharedDemoResult,
    ChangeDemoSourceRequest,
    ChangeDemoSourceResult,
    ProbeSharedDemoRequest,
    SharedDemoProbeResult,
} from '@/types/webviewRequests';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<R> {
    success: boolean;
    error?: string;
    result?: R;
}

export type ProbeState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; result: SharedDemoProbeResult }
    | { status: 'failed'; error: string };

export interface UseAddDemoFlowArgs {
    /** The shipped catalog, for naming the card a recognised template maps to. */
    packages: DemoPackage[];
    /** "Use Starter": select the shipped card instead of adding. */
    onUseShipped: (packageId: string) => void;
    /**
     * The row the host committed: remembered (add mode), or now the open
     * project's source (change mode).
     */
    onDemoAdded: (demo: AddedDemo) => void;
    onClose: () => void;
    /** Add (default) or the dashboard's change-source door. */
    mode?: AddDemoMode;
    /** Change mode: the project's storefront kind, which the new source must match. */
    currentKind?: StorefrontKind;
}

export interface UseAddDemoFlowReturn {
    stage: AddDemoStage;
    draft: AddDemoDraft;
    probe: ProbeState;
    adding: boolean;
    addError?: string;
    canContinue: boolean;
    canGoBack: boolean;
    continueLabel: string;
    onContinue: () => void;
    onBack: () => void;
    setSource: (source: AddDemoDraft['source']) => void;
    setName: (name: string) => void;
    setB2bOn: (on: boolean) => void;
    setKeepCopy: (keep: boolean) => void;
    setUpdateRemembered: (update: boolean) => void;
}

const PROBE_FAILED = "We couldn't look at this demo. Check the link and try again.";
const ADD_FAILED = "We couldn't add this demo. Try again.";
const CHANGE_FAILED = "We couldn't change the source. Try again.";

/**
 * The dialog's state machine.
 *
 * @param args - the catalog and the commit callbacks
 * @returns the stage, the draft, the probe state, and the footer surfaces
 */
export function useAddDemoFlow(args: UseAddDemoFlowArgs): UseAddDemoFlowReturn {
    const { packages, onUseShipped, onDemoAdded, onClose, mode = 'add', currentKind } = args;
    const [stage, setStage] = useState<AddDemoStage>('link');
    const [draft, setDraft] = useState<AddDemoDraft>(INITIAL_DRAFT);
    const [probe, setProbe] = useState<ProbeState>({ status: 'idle' });
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | undefined>(undefined);

    const result = probe.status === 'done' ? probe.result : undefined;
    const shippedName =
        result?.outcome === 'shipped'
            ? packages.find((pkg) => pkg.id === result.shippedPackageId)?.name
            : undefined;

    const runProbe = useCallback(async (): Promise<void> => {
        if (!draft.source) return;
        setProbe({ status: 'loading' });
        setStage('found');
        try {
            const request: ProbeSharedDemoRequest = draft.source;
            const answer = await webviewClient.request<Answer<SharedDemoProbeResult>>(
                'probe-shared-demo',
                request,
            );
            if (!answer.success || !answer.result) {
                setProbe({ status: 'failed', error: answer.error ?? PROBE_FAILED });
                return;
            }
            setProbe({ status: 'done', result: answer.result });
        } catch (error) {
            setProbe({ status: 'failed', error: (error as Error).message || PROBE_FAILED });
        }
    }, [draft.source]);

    /** The one host call of the found stage: add remembers, change repoints the project. */
    const commit = useCallback(async (): Promise<void> => {
        if (!isBuildable(result)) return;
        const keepCopy = draft.keepCopy && !result.viewer?.ownsRepo;
        const demo = buildAddedDemo(result, draft);
        const failed = mode === 'change' ? CHANGE_FAILED : ADD_FAILED;
        setAdding(true);
        setAddError(undefined);
        try {
            const answer =
                mode === 'change'
                    ? await webviewClient.request<Answer<ChangeDemoSourceResult>>('change-demo-source', {
                          demo,
                          keepCopy,
                          updateRemembered: draft.updateRemembered,
                      } satisfies ChangeDemoSourceRequest)
                    : await webviewClient.request<Answer<AddSharedDemoResult>>('add-shared-demo', {
                          demo,
                          keepCopy,
                      } satisfies AddSharedDemoRequest);
            if (!answer.success || !answer.result) {
                setAddError(answer.error ?? failed);
                return;
            }
            onDemoAdded(answer.result.demo);
            onClose();
        } catch (error) {
            setAddError((error as Error).message || failed);
        } finally {
            setAdding(false);
        }
    }, [result, draft, mode, onDemoAdded, onClose]);

    // Change mode never takes a shipped template (nothing to read a row from)
    // and only a demo of the project's own kind.
    const buildable = isBuildable(result) && (mode === 'add' || kindMatches(result, currentKind));
    const canContinue =
        stage === 'link'
            ? draft.source !== undefined
            : !adding && ((mode === 'add' && result?.outcome === 'shipped') || buildable);

    const onContinue = useCallback((): void => {
        if (!canContinue) return;
        if (stage === 'link') {
            void runProbe();
            return;
        }
        if (result?.outcome === 'shipped') {
            onUseShipped(result.shippedPackageId);
            onClose();
            return;
        }
        void commit();
    }, [canContinue, stage, runProbe, result, onUseShipped, onClose, commit]);

    const onBack = useCallback((): void => {
        if (stage !== 'found' || adding) return;
        setStage('link');
        setProbe({ status: 'idle' });
        setAddError(undefined);
    }, [stage, adding]);

    const setSource = useCallback((source: AddDemoDraft['source']): void => {
        setDraft((d) => ({ ...d, source }));
    }, []);
    const setName = useCallback((name: string): void => {
        setDraft((d) => ({ ...d, name }));
    }, []);
    const setB2bOn = useCallback((b2bOn: boolean): void => {
        setDraft((d) => ({ ...d, b2bOn }));
    }, []);
    const setKeepCopy = useCallback((keepCopy: boolean): void => {
        setDraft((d) => ({ ...d, keepCopy }));
    }, []);
    const setUpdateRemembered = useCallback((updateRemembered: boolean): void => {
        setDraft((d) => ({ ...d, updateRemembered }));
    }, []);

    return {
        stage,
        draft,
        probe,
        adding,
        addError,
        canContinue,
        canGoBack: stage === 'found' && !adding,
        continueLabel: continueLabelFor(stage, result, shippedName, mode),
        onContinue,
        onBack,
        setSource,
        setName,
        setB2bOn,
        setKeepCopy,
        setUpdateRemembered,
    };
}
