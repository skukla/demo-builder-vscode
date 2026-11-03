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
 * What the dialog shows follows the dialog design rules: the read is the Modal's
 * wait, with no words, from the first frame (the state below mounts per opening, so
 * nothing is drawn before it); a failed read and "signed out" are the title's
 * outcome with the one way on as the action.
 *
 * Hosting mirrors {@link AppBuilderComponentRemoveDialog}: an always-mounted
 * DialogContainer with the Modal rendered only while `isOpen`; the list owns
 * ONE shared instance keyed by the pending row id.
 *
 * @module features/dashboard/ui/components/ManageApisModal
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ADOBE_APIS_WAIT } from '@/core/ui/components/feedback/adobeApisWait';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';
import { Modal, type ActionButton, type ModalProps } from '@/core/ui/components/ui/Modal';
import { useOperationProgress } from '@/core/ui/hooks/useOperationProgress';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { CONSOLE_APIS_OPERATION_ID } from '@/core/utils/operationIds';
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

/** A dialog reading what it will show says nothing while it does. */

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
 * The height the list arrives at, as a floor: the dialog fits the list, and filtering the list
 * then changes only what is in it, not the size of the dialog.
 */
function useListFloor(listShown: boolean): { ref: React.RefObject<HTMLDivElement | null>; floor: number } {
    const ref = useRef<HTMLDivElement>(null);
    const [floor, setFloor] = useState(0);
    useLayoutEffect(() => {
        if (listShown && floor === 0 && ref.current) setFloor(ref.current.getBoundingClientRect().height);
    }, [listShown, floor]);
    return { ref, floor };
}

/** The title, the wait and the way on, for where the read and the apply stand. */
function viewOf(
    name: string,
    list: ApiList,
    apply: ActionButton,
    applying: { isApplying: boolean; stage?: string; step?: string; error: string | null },
): Pick<ModalProps, 'title' | 'status' | 'waiting' | 'actionButtons' | 'closeLabel'> {
    const title = MANAGE_APIS_COPY.title(name);
    if (applying.isApplying) {
        // The subscribe's own lines: it reads the workspace's credentials and can wait on Adobe
        // for a minute (PL-59 slice 6). Work the SC started says what is happening.
        return { title, waiting: { message: applying.stage ?? 'Applying', detail: applying.step }, closeLabel: 'Cancel' };
    }
    if (list.isLoading) return { title, waiting: ADOBE_APIS_WAIT, closeLabel: 'Cancel' };
    if (list.needsSignIn) {
        const signIn: ActionButton = { label: MANAGE_APIS_COPY.signIn, variant: 'accent', onPress: list.signIn };
        return { title: MANAGE_APIS_COPY.signInTitle, status: 'warning', actionButtons: [signIn] };
    }
    if (list.loadError) {
        const retry: ActionButton = { label: MANAGE_APIS_COPY.retry, variant: 'accent', onPress: list.retry };
        return { title: MANAGE_APIS_COPY.loadFailedTitle, status: 'error', actionButtons: [retry] };
    }
    if (applying.error) {
        return { title: MANAGE_APIS_COPY.applyFailedTitle, status: 'error', actionButtons: [apply], closeLabel: 'Cancel' };
    }
    return { title, actionButtons: [apply], closeLabel: 'Cancel' };
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

/** The open dialog: mounted per opening, so each starts on its wait. */
function ManageApisDialog({ componentName, componentId, onClose }: Omit<ManageApisModalProps, 'isOpen'>): React.ReactElement {
    const list = useApiList(componentId);
    const apply = useApply(componentId, list, onClose);
    const listShown = !list.isLoading && !list.needsSignIn && !list.loadError;
    const { ref, floor } = useListFloor(listShown && !apply.state.isApplying);

    return (
        <Modal fitContent size="L" onClose={onClose} {...viewOf(componentName, list, apply.button, apply.state)}>
            {list.needsSignIn && <Text>{MANAGE_APIS_COPY.signInBody}</Text>}
            {!list.needsSignIn && list.loadError && <Text>{list.loadError}</Text>}
            {listShown && (
                <SteadyHeight minHeight={floor} align="start">
                    {/* A plain div, NOT Spectrum's Flex: Flex caps its width at
                        ~450px (root CLAUDE.md gotcha), and inside a size-L dialog
                        the API list is wider than that — so the body overflowed
                        its own container and the modal grew a horizontal
                        scrollbar. */}
                    <div className="manage-apis-body" ref={ref}>
                        {apply.state.error && <Text>{apply.state.error}</Text>}
                        <ApiAccessPicker apis={list.apis} selected={list.selected} onToggle={list.toggle} />
                    </div>
                </SteadyHeight>
            )}
        </Modal>
    );
}

/**
 * The Manage-APIs modal: fetch-on-open option list, locked managed rows,
 * additive Apply against the live `addConsoleApis` handler.
 */
export function ManageApisModal({ isOpen, ...dialog }: ManageApisModalProps): React.ReactElement {
    return <DialogContainer onDismiss={dialog.onClose}>{isOpen && <ManageApisDialog key={dialog.componentId} {...dialog} />}</DialogContainer>;
}
