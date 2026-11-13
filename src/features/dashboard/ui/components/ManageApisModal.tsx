/**
 * ManageApisModal — the dashboard's live "Manage APIs" surface for a DEPLOYED
 * App Builder integration (Integrations redesign, Step 11 — parity with the
 * wizard's api-access stage, but with dashboard semantics: Apply posts
 * IMMEDIATELY).
 *
 * On open it fetches the org's entitlement list ONCE via the existing
 * `listConsoleApis` handler. Entries flagged `managed` (ALWAYS-ON — catalog
 * requiredApis + baseline) render as the shared picker's `locked` rows. The
 * project's current OPTIONAL extras (`added`) seed `selected` so they render
 * checked + removable. Check adds, uncheck removes; Apply posts `setConsoleApis`
 * with the FULL desired optional set (the handler subscribes the reconcile union
 * and unsubscribes anything dropped). Success closes; failure is the title's
 * outcome, in red, and stays open. Apply is disabled until the set changes.
 *
 * What the dialog shows follows the dialog design rules, on the Steps layout (Phase 1b): the
 * read is the window's wait, the list and the apply follow at one height, and a failed apply is
 * the title's outcome. A failed read and "signed out" are a small result window in its place
 * (`ResultWindow`): the title's outcome, with the one way on as the action.
 *
 * Hosting mirrors {@link AppBuilderComponentRemoveDialog}: an always-mounted
 * DialogContainer with the window rendered only while `isOpen`; the list owns
 * ONE shared instance keyed by the pending row id.
 *
 * @module features/dashboard/ui/components/ManageApisModal
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';
import type { ActionButton, ModalWait } from '@/core/ui/components/ui/Modal';
import { ResultWindow } from '@/core/ui/components/ui/ResultDialog';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { CONSOLE_APIS_OPERATION_ID } from '@/core/utils/operationIds';
import { expectationFor } from '@/core/utils/operationStages';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { CloudGrouping } from '@/types/adobeApis';
import { ErrorCode } from '@/types/errorCodes';

/** One org service as the `listConsoleApis` handler reports it. */
interface ConsoleApiEntry {
    code: string;
    name: string;
    /** Already covered by the reconcile union → rendered locked. */
    managed: boolean;
    /** Blocked by a missing product profile → rendered disabled. */
    requiresProfile?: boolean;
    /** Needs Adobe review/approval → rendered disabled. */
    requiresReview?: boolean;
    /** Product family (Console "Filter by product") for the picker's sub-headers. */
    group?: CloudGrouping;
}

interface ListConsoleApisResponse {
    success?: boolean;
    /** `added` = the project's current OPTIONAL extras (checked + removable). */
    data?: { apis: ConsoleApiEntry[]; added?: string[] };
    error?: string;
    /** AUTH_REQUIRED distinguishes "signed out" from a retryable failure. */
    code?: ErrorCode;
}

interface SetConsoleApisResponse {
    success?: boolean;
    error?: string;
}

export interface ManageApisModalProps {
    /** Whether the modal is shown (the list keeps ONE instance for all rows). */
    isOpen: boolean;
    /** Display name of the integration whose API access is being managed. */
    componentName: string;
    /**
     * The integration these picks belong to. Scopes both the list (its own rows,
     * with attribution for everyone else's) and the write (only its entry in
     * componentApiPicks).
     *
     * Optional on purpose: step 06's project-level union view is THIS modal with
     * no componentId, and the handlers already treat its absence as project scope.
     */
    componentId?: string;
    /** Called on Cancel/dismiss and after a successful Apply. */
    onClose: () => void;
}

/** Every string the dialog shows that it does not take from the extension, in one place. */
export const MANAGE_APIS_COPY = {
    title: (name: string) => `Manage APIs for ${name}`,
    loadFailedTitle: "Couldn't Load Adobe APIs",
    retry: 'Retry',
    signInTitle: 'Sign In to Adobe',
    signIn: 'Sign In with Adobe',
    // Says the browser is coming before it does: an unannounced jump reads as a glitch.
    signInBody: "Your Adobe session has ended. Sign in to manage this app's API access. Adobe sign-in will open in your browser.",
    applyFailedTitle: "Couldn't Update API Access",
};

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** The API rows as the shared picker takes them. */
function toOptions(apis: ConsoleApiEntry[]): ApiAccessOption[] {
    return apis.map((api) => ({
        code: api.code,
        name: api.name,
        locked: api.managed,
        requiresProfile: api.requiresProfile,
        requiresReview: api.requiresReview,
        group: api.group,
    }));
}

/** The read's answer, for the dialog to show. */
interface ApiList {
    apis: ApiAccessOption[];
    /** The OPTIONAL extras as loaded: Apply is a no-op (disabled) until `selected` differs. */
    initial: string[];
    selected: string[];
    /** A failed read, retryable. */
    loadError: string | null;
    /** The read failed for want of a sign-in: signing in is the way on, never a Retry. */
    needsSignIn: boolean;
    isLoading: boolean;
    toggle: (code: string) => void;
    retry: () => void;
    signIn: () => void;
}

/**
 * Read the org's APIs as the dialog opens (and again on Retry), and hold the SC's picks. Mounted
 * per opening, so the first render already knows it is reading and prior picks cannot leak.
 */
function useApiList(componentId: string | undefined): ApiList {
    const [apis, setApis] = useState<ApiAccessOption[]>([]);
    const [initial, setInitial] = useState<string[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [needsSignIn, setNeedsSignIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    /** Bumped by Retry to re-fire the fetch. */
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        webviewClient
            .request<ListConsoleApisResponse>('listConsoleApis', componentId ? { componentId } : undefined)
            .then((res) => {
                if (cancelled) return;
                if (res?.success && res.data) {
                    const added = res.data.added ?? [];
                    setApis(toOptions(res.data.apis));
                    setSelected(added);
                    setInitial(added);
                } else {
                    setNeedsSignIn(res?.code === ErrorCode.AUTH_REQUIRED);
                    setLoadError(res?.error ?? 'Could not load Adobe APIs.');
                }
            })
            .catch((err) => {
                if (!cancelled) setLoadError(toMessage(err));
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [reloadKey, componentId]);

    const retry = useCallback((): void => {
        setLoadError(null);
        setNeedsSignIn(false);
        setIsLoading(true);
        setReloadKey((key) => key + 1);
    }, []);
    const toggle = useCallback((code: string): void => {
        setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    }, []);
    // The dashboard webview's sign-in message; resolves when the browser flow ends, so the
    // reload lands on a signed-in session.
    const signIn = useCallback((): void => {
        void webviewClient.request('reAuthenticate').catch(() => undefined).then(retry);
    }, [retry]);

    return { apis, initial, selected, loadError, needsSignIn, isLoading, toggle, retry, signIn };
}

/**
 * The subscribe's own lines while it applies, with its stage's expectation from the stage table:
 * it reads the workspace's credentials and can wait on Adobe for a minute (PL-59 slice 6).
 */
function applyingWait(stage: string | undefined, step: string | undefined): ModalWait {
    const label = stage ?? 'Applying';
    return { label, detail: step, expectation: expectationFor(label) };
}

/**
 * A read with no list to show: signed out, whose one way on is signing in (never a Retry), or a
 * failed read, whose way on is Retry. Its own small result window, in place of the steps.
 */
function NoListWindow({ list, onClose }: { list: ApiList; onClose: () => void }): React.ReactElement {
    if (list.needsSignIn) {
        const signIn: ActionButton = { label: MANAGE_APIS_COPY.signIn, variant: 'accent', onPress: list.signIn };
        return (
            <ResultWindow title={MANAGE_APIS_COPY.signInTitle} status="warning" actionButtons={[signIn]} onClose={onClose}>
                <p className="dialog-line">{MANAGE_APIS_COPY.signInBody}</p>
            </ResultWindow>
        );
    }
    const retry: ActionButton = { label: MANAGE_APIS_COPY.retry, variant: 'accent', onPress: list.retry };
    return (
        <ResultWindow title={MANAGE_APIS_COPY.loadFailedTitle} status="error" actionButtons={[retry]} onClose={onClose}>
            <p className="dialog-line">{list.loadError}</p>
        </ResultWindow>
    );
}

/**
 * Apply the picks: sets the extras to exactly what is ticked. Success closes the dialog.
 *
 * @param componentId - the integration the picks belong to, when there is one
 * @param list - the picks, as loaded and as they stand
 * @param onClose - closes the dialog once the change went through
 */
function useApply(componentId: string | undefined, list: ApiList, onClose: () => void) {
    const { selected, initial } = list;
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The shared progress channel, which the apply handler reports on.
    const progress = useOperationProgress(
        isApplying ? CONSOLE_APIS_OPERATION_ID : null,
        isApplying ? 1 : 0,
        false,
    );
    // Dirty = the optional set differs from what was loaded (add OR remove).
    const isDirty = selected.length !== initial.length || selected.some((code) => !initial.includes(code));

    const run = async (): Promise<void> => {
        if (!isDirty || isApplying) return;
        setIsApplying(true);
        setError(null);
        try {
            // setConsoleApis SETS the extras to exactly `selected` — unchecked codes
            // are removed (unsubscribed on the reconcile PUT).
            const res = await webviewClient.request<SetConsoleApisResponse>('setConsoleApis', {
                apis: selected,
                ...(componentId ? { componentId } : {}),
            });
            if (res?.success) onClose();
            else setError(res?.error ?? 'Could not update API access.');
        } catch (err) {
            setError(toMessage(err));
        } finally {
            setIsApplying(false);
        }
    };
    const button: ActionButton = {
        label: 'Apply',
        variant: 'accent',
        onPress: () => {
            void run();
        },
        isDisabled: !isDirty,
    };
    return { button, state: { isApplying, stage: progress?.stage, step: progress?.step, error } };
}

/**
 * The open dialog: mounted per opening, so each starts on its wait. The Steps layout's window: it
 * stays unseen while the list is read, opens at the list's height and keeps it through the apply
 * and its failure (rule 14); filtering the list changes what is in it, never the window.
 */
function ManageApisDialog({ componentName, componentId, onClose }: Omit<ManageApisModalProps, 'isOpen'>): React.ReactElement {
    const list = useApiList(componentId);
    const apply = useApply(componentId, list, onClose);
    const { isApplying, stage, step, error } = apply.state;
    if (list.needsSignIn || list.loadError) return <NoListWindow list={list} onClose={onClose} />;
    let waiting: ModalWait | false = false;
    if (isApplying) waiting = applyingWait(stage, step);
    else if (list.isLoading) waiting = WAIT_STAGES.readingAdobeServices;

    return (
        <StepsWindow
            title={error ? MANAGE_APIS_COPY.applyFailedTitle : MANAGE_APIS_COPY.title(componentName)}
            status={error ? 'error' : undefined}
            waiting={waiting}
            ready={!list.isLoading}
            closeLabel="Cancel"
            actionButtons={[apply.button]}
            onClose={onClose}
        >
            {/* A plain div, NOT Spectrum's Flex: Flex caps its width at ~450px (root CLAUDE.md
                gotcha), and inside a size-L dialog the API list is wider than that. */}
            <div className="manage-apis-body">
                {error && <p className="dialog-line">{error}</p>}
                <ApiAccessPicker apis={list.apis} selected={list.selected} onToggle={list.toggle} />
            </div>
        </StepsWindow>
    );
}

/**
 * The Manage-APIs modal: fetch-on-open option list, locked managed rows,
 * additive Apply against the live `addConsoleApis` handler.
 */
export function ManageApisModal({ isOpen, ...dialog }: ManageApisModalProps): React.ReactElement {
    return <DialogContainer onDismiss={dialog.onClose}>{isOpen && <ManageApisDialog key={dialog.componentId} {...dialog} />}</DialogContainer>;
}
