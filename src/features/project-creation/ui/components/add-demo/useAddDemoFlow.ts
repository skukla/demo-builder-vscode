/**
 * useAddDemoFlow — the "Add a demo package" dialog's state: the draft, the probe, the
 * add commit. Backend calls happen at the two commitment points only
 * (`docs/patterns/selection-pattern.md`): Continue off the link stage probes;
 * "Add demo" keeps a copy when asked and remembers the row. Typing and
 * ticking never talk to the host.
 *
 * @module features/project-creation/ui/components/add-demo/useAddDemoFlow
 */

import { useCallback, useEffect, useState } from 'react';
import {
    buildAddedDemo,
    continueLabel as continueLabelFor,
    INITIAL_DRAFT,
    isBuildable,
    kindMatches,
    type AddDemoDraft,
    type AddDemoMode,
    type AddDemoStage,
    type AddDemoWay,
} from './addDemoFlow';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo, StorefrontKind } from '@/types/projectFile';
import type { SettingsFile } from '@/types/settingsFile';
import type { StorefrontZipProgressPayload } from '@/types/webviewPayloads';
import type {
    AddSharedDemoRequest,
    AddSharedDemoResult,
    ChangeDemoSourceRequest,
    ChangeDemoSourceResult,
    ImportStorefrontZipRequest,
    ImportStorefrontZipResult,
    ProbeSharedDemoRequest,
    SharedDemoProbeResult,
    UseBundleSetupRequest,
} from '@/types/webviewRequests';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<R> {
    success: boolean;
    error?: string;
    result?: R;
    /** The probe's refusal when no GitHub session can be found. */
    needsAuth?: string;
    /** The zip import's refusal when the account already has a repository by that name. */
    existing?: { owner: string; repo: string };
}

export type ProbeState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; result: SharedDemoProbeResult }
    | { status: 'failed'; error: string; needsAuth?: boolean };

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
    /** Which way in the first stage shows: a link field, or the zip's options. */
    way: AddDemoWay;
    setWay: (way: AddDemoWay) => void;
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
    setDescription: (description: string) => void;
    setB2bOn: (on: boolean) => void;
    setKeepCopy: (keep: boolean) => void;
    setUpdateRemembered: (update: boolean) => void;
    /** The zip is becoming a repository: the host is picking, unpacking and pushing. */
    importing: boolean;
    /** The step the import is on, as the host last reported it. */
    importStep?: StorefrontZipProgressPayload;
    zipError?: string;
    /** The repository the zip's name is already taken by, when that is why it failed. */
    zipConflict?: { owner: string; repo: string };
    /** Add the demo from that existing repository instead. */
    useExistingRepo: () => void;
    makePublic: boolean;
    setMakePublic: (on: boolean) => void;
    /** The setup a bundle carried, when the zip was one. */
    bundleSetup?: SettingsFile;
    /** Add the demo, then reopen the wizard pre-filled from the bundle's setup. */
    startFromBundle: () => void;
}

const PROBE_FAILED = "We couldn't read this storefront. Check the link and try again.";
const IMPORT_FAILED = "We couldn't add this zip. Try again.";
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
    const [way, setWay] = useState<AddDemoWay>('link');
    const [draft, setDraft] = useState<AddDemoDraft>(INITIAL_DRAFT);
    const [probe, setProbe] = useState<ProbeState>({ status: 'idle' });
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | undefined>(undefined);
    const [importing, setImporting] = useState(false);
    const [zipError, setZipError] = useState<string | undefined>(undefined);
    const [importStep, setImportStep] = useState<StorefrontZipProgressPayload | undefined>(undefined);

    // Listen for the host's step reports only while an import runs; a new import starts blank.
    useEffect(() => {
        if (!importing) {
            setImportStep(undefined);
            return undefined;
        }
        return webviewClient.onMessage('storefront-zip-progress', (data) => setImportStep(data as StorefrontZipProgressPayload));
    }, [importing]);
    const [zipConflict, setZipConflict] = useState<{ owner: string; repo: string } | undefined>(undefined);
    // Public by default (owner, 2026-09-14): a demo package is for sharing.
    const [makePublic, setMakePublic] = useState(true);
    const [bundleSetup, setBundleSetup] = useState<SettingsFile | undefined>(undefined);

    const result = probe.status === 'done' ? probe.result : undefined;
    const shippedName =
        result?.outcome === 'shipped'
            ? packages.find((pkg) => pkg.id === result.shippedPackageId)?.name
            : undefined;

    const probeSource = useCallback(async (source: NonNullable<AddDemoDraft['source']>): Promise<void> => {
        setProbe({ status: 'loading' });
        setStage('found');
        try {
            const request: ProbeSharedDemoRequest = source;
            const answer = await webviewClient.request<Answer<SharedDemoProbeResult>>(
                'probe-shared-demo',
                request,
            );
            if (!answer.success || !answer.result) {
                setProbe({
                    status: 'failed',
                    error: answer.error ?? PROBE_FAILED,
                    ...(answer.needsAuth ? { needsAuth: true } : {}),
                });
                return;
            }
            setProbe({ status: 'done', result: answer.result });
        } catch (error) {
            setProbe({ status: 'failed', error: (error as Error).message || PROBE_FAILED });
        }
    }, []);

    const runProbe = useCallback(async (): Promise<void> => {
        if (draft.source) await probeSource(draft.source);
    }, [draft.source, probeSource]);

    /**
     * The zip door: one host call that picks the file, creates the repository in
     * the SC's account and pushes the files; then the same probe as for a link.
     * A dismissed picker leaves the dialog where it was.
     */
    const importZip = useCallback(async (): Promise<void> => {
        setImporting(true);
        setZipError(undefined);
        setZipConflict(undefined);
        try {
            const answer = await webviewClient.request<Answer<ImportStorefrontZipResult>>('import-storefront-zip', {
                isPrivate: !makePublic,
            } satisfies ImportStorefrontZipRequest);
            if (!answer.success || !answer.result) {
                setZipError(answer.error ?? IMPORT_FAILED);
                setZipConflict(answer.existing);
                return;
            }
            const { cancelled, owner, repo, setup } = answer.result;
            if (cancelled || !owner || !repo) return;
            setBundleSetup(setup);
            const source = { owner, repo };
            setDraft((d) => ({ ...d, source }));
            await probeSource(source);
        } catch (error) {
            setZipError((error as Error).message || IMPORT_FAILED);
        } finally {
            setImporting(false);
        }
    }, [makePublic, probeSource]);

    /** The one host call of the found stage: add remembers, change repoints the project. Answers the row. */
    const commit = useCallback(async (): Promise<AddedDemo | undefined> => {
        if (!isBuildable(result)) return undefined;
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
                setAdding(false);
                return undefined;
            }
            // `adding` stays on: the dialog is closing, and Spectrum's
            // DialogContainer keeps rendering it through the exit animation.
            // Turning it off here flashed the form on the way out.
            onDemoAdded(answer.result.demo);
            onClose();
            return answer.result.demo;
        } catch (error) {
            setAddError((error as Error).message || failed);
            setAdding(false);
            return undefined;
        }
    }, [result, draft, mode, onDemoAdded, onClose]);

    /** Add the demo, then hand the bundle's setup and the row to the host, which reopens the wizard. */
    const startFromBundle = useCallback(async (): Promise<void> => {
        if (!bundleSetup) return;
        const added = await commit();
        if (!added) return;
        await webviewClient.request<Answer<unknown>>('use-bundle-setup', { setup: bundleSetup, demo: added } satisfies UseBundleSetupRequest);
    }, [bundleSetup, commit]);

    // Change mode never takes a shipped template (nothing to read a row from)
    // and only a demo of the project's own kind.
    const buildable = isBuildable(result) && (mode === 'add' || kindMatches(result, currentKind));
    // The zip way reads nothing from the form: its Continue IS the picker.
    const zipWay = mode === 'add' && way === 'zip';
    const canContinue =
        stage === 'link'
            ? !importing && !zipError && (zipWay || draft.source !== undefined)
            : !adding && !importing && !addError && ((mode === 'add' && result?.outcome === 'shipped') || buildable);

    const onContinue = useCallback((): void => {
        if (!canContinue) return;
        if (stage === 'link') {
            void (zipWay ? importZip() : runProbe());
            return;
        }
        if (result?.outcome === 'shipped') {
            onUseShipped(result.shippedPackageId);
            onClose();
            return;
        }
        void commit();
    }, [canContinue, stage, zipWay, importZip, runProbe, result, onUseShipped, onClose, commit]);

    const onBack = useCallback((): void => {
        // From an error view, Back returns to the form the error came from.
        if (zipError) {
            setZipError(undefined);
            setZipConflict(undefined);
            return;
        }
        if (addError) {
            setAddError(undefined);
            return;
        }
        if (stage !== 'found' || adding) return;
        setStage('link');
        setProbe({ status: 'idle' });
    }, [zipError, addError, stage, adding]);

    const useExistingRepo = useCallback((): void => {
        if (!zipConflict) return;
        const source = zipConflict;
        setZipError(undefined);
        setZipConflict(undefined);
        setDraft((d) => ({ ...d, source }));
        void probeSource(source);
    }, [zipConflict, probeSource]);

    const setSource = useCallback((source: AddDemoDraft['source']): void => {
        setDraft((d) => ({ ...d, source }));
    }, []);
    const setName = useCallback((name: string): void => {
        setDraft((d) => ({ ...d, name }));
    }, []);
    const setDescription = useCallback((description: string): void => {
        setDraft((d) => ({ ...d, description }));
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
        way,
        setWay,
        draft,
        probe,
        adding,
        addError,
        canContinue,
        canGoBack: Boolean(zipError) || (stage === 'found' && !adding),
        continueLabel: continueLabelFor(stage, result, shippedName, mode, way),
        onContinue,
        onBack,
        setSource,
        setName,
        setDescription,
        setB2bOn,
        setKeepCopy,
        setUpdateRemembered,
        importing,
        importStep,
        zipError,
        zipConflict,
        useExistingRepo,
        makePublic,
        setMakePublic,
        bundleSetup,
        startFromBundle: () => void startFromBundle(),
    };
}
