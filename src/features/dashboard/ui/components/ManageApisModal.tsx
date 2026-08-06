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
 * and unsubscribes anything dropped). Success closes; failure shows an inline
 * error and stays open. Apply is disabled until the set changes.
 *
 * Hosting mirrors {@link AppBuilderComponentRemoveDialog}: an always-mounted
 * DialogContainer with the Modal rendered only while `isOpen`; the list owns
 * ONE shared instance keyed by the pending row id.
 *
 * @module features/dashboard/ui/components/ManageApisModal
 */

import { Button, DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { renderApiCatalogFeedback } from '@/core/ui/components/feedback/ApiCatalogFeedback';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection';
import { Modal } from '@/core/ui/components/ui/Modal';
import {
    useElapsedStage,
    ORG_SERVICES_LOADING_STAGES,
} from '@/core/ui/hooks/useElapsedStage';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { CloudGrouping } from '@/types/adobeApis';
import { ErrorCode } from '@/types/errorCodes';

/**
 * Codes Adobe still has subscribed that nothing in the project claims — surfaced
 * only in the project-level view (the handler does not compute them per
 * integration). Removing them is a real unsubscribe, so it is confirmed.
 */
type OrphanState = { codes: string[]; confirming: boolean };

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
    data?: { apis: ConsoleApiEntry[]; added?: string[]; orphans?: string[] };
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

/**
 * Reserved height for the loading/error views, so the pre-list states fill the
 * same band the list will. The dialog's height comes from `.manage-apis-body`
 * (custom-spectrum.css), which is a constant — see there for why.
 */
const FEEDBACK_HEIGHT = '320px';

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Compact fetch states (inline, not tall-centered) around the shared picker. */
function ManageApisBody({
    loadingStage,
    isLoading,
    loadError,
    needsSignIn,
    onSignIn,
    onRetry,
    apis,
    selected,
    onToggle,
}: {
    loadingStage?: string;
    isLoading: boolean;
    loadError: string | null;
    /** Render the sign-in view rather than the retryable-error view. */
    needsSignIn?: boolean;
    /** Start a user-initiated Adobe sign-in; resolves when it finishes. */
    onSignIn?: () => Promise<unknown>;
    onRetry?: () => void;
    apis: ApiAccessOption[];
    selected: string[];
    onToggle: (code: string) => void;
}): React.ReactElement {
    // The three non-picker views are shared with the wizard's picker stage
    // (renderApiCatalogFeedback) — same fetch, same states. Only the wrapper differs:
    // the reserved height stops this dialog resizing when the list lands.
    const feedback = renderApiCatalogFeedback({
        loading: isLoading,
        loadingStage,
        needsSignIn,
        error: loadError,
        onSignIn,
        onRetry,
        signInPurpose: "manage this app's API access",
    });
    if (feedback) {
        return (
            <CenteredFeedbackContainer height={FEEDBACK_HEIGHT}>{feedback}</CenteredFeedbackContainer>
        );
    }

    return (
        <ApiAccessPicker
            apis={apis}
            selected={selected}
            onToggle={onToggle}
        />
    );
}

/**
 * The Manage-APIs modal: fetch-on-open option list, locked managed rows,
 * additive Apply against the live `addConsoleApis` handler.
 */
export function ManageApisModal({
    isOpen,
    componentName,
    componentId,
    onClose,
}: ManageApisModalProps): React.ReactElement {
    const [apis, setApis] = useState<ApiAccessOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    /** "Signed out" is a DIFFERENT view from a retryable failure (see ManageApisBody). */
    const [needsSignIn, setNeedsSignIn] = useState(false);
    /** The OPTIONAL extras: seeded from the project's existing added set, then
        edited (check adds, uncheck removes). Managed codes are locked, never here. */
    const [selected, setSelected] = useState<string[]>([]);
    /** The set as loaded — Apply is a no-op (disabled) until this changes. */
    const [initial, setInitial] = useState<string[]>([]);
    const [isApplying, setIsApplying] = useState(false);
    const loadingStage = useElapsedStage(isLoading, ORG_SERVICES_LOADING_STAGES);
    /** Bumped by the error view's Retry to re-fire the fetch. */
    const [reloadKey, setReloadKey] = useState(0);
    const retry = useCallback(() => setReloadKey((key) => key + 1), []);
    // The dashboard webview's sign-in message; resolves when the browser flow ends,
    // so the reload lands on a signed-in session.
    const signIn = useCallback(
        () => webviewClient.request('reAuthenticate').catch(() => undefined),
        [],
    );
    const [applyError, setApplyError] = useState<string | null>(null);
    const [orphans, setOrphans] = useState<OrphanState>({ codes: [], confirming: false });

    useEffect(() => {
        if (!isOpen) return undefined;
        // Each open starts fresh: prior picks/errors must not leak between rows.
        let cancelled = false;
        setApis([]);
        setSelected([]);
        setInitial([]);
        setLoadError(null);
        setNeedsSignIn(false);
        setApplyError(null);
        setIsLoading(true);
        webviewClient
            .request<ListConsoleApisResponse>(
                'listConsoleApis',
                componentId ? { componentId } : undefined,
            )
            .then((res) => {
                if (cancelled) return;
                if (res?.success && res.data) {
                    setOrphans({ codes: res.data.orphans ?? [], confirming: false });
                    setApis(
                        res.data.apis.map((api) => ({
                            code: api.code,
                            name: api.name,
                            locked: api.managed,
                            requiresProfile: api.requiresProfile,
                            requiresReview: api.requiresReview,
                            group: api.group,
                        })),
                    );
                    const added = res.data.added ?? [];
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
        // componentId included: the grid keeps ONE modal instance for every row, so
        // the integration under edit can change without a remount.
    }, [isOpen, reloadKey, componentId]);

    const handleToggle = (code: string): void => {
        setSelected((prev) =>
            prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
        );
    };

    // Dirty = the optional set differs from what was loaded (add OR remove).
    const isDirty =
        selected.length !== initial.length || selected.some((code) => !initial.includes(code));

    const handleApply = async (): Promise<void> => {
        if (!isDirty || isApplying) return;
        setIsApplying(true);
        setApplyError(null);
        try {
            // setConsoleApis SETS the extras to exactly `selected` — unchecked codes
            // are removed (unsubscribed on the reconcile PUT).
            const res = await webviewClient.request<SetConsoleApisResponse>('setConsoleApis', {
                apis: selected,
                ...(componentId ? { componentId } : {}),
            });
            if (res?.success) {
                onClose();
            } else {
                setApplyError(res?.error ?? 'Could not update API access.');
            }
        } catch (err) {
            setApplyError(toMessage(err));
        } finally {
            setIsApplying(false);
        }
    };

    /**
     * Drop the orphans by reconciling to what the project still claims.
     *
     * There is no unsubscribe endpoint — the subscribe PUT sets the workspace to
     * EXACTLY the union it is handed, so a code absent from `selected` is dropped by
     * the same call that keeps the rest. That is why this is a confirmed action and
     * not a quiet tidy-up.
     */
    const handleRemoveOrphans = async (): Promise<void> => {
        setApplyError(null);
        try {
            const res = await webviewClient.request<SetConsoleApisResponse>('setConsoleApis', {
                apis: selected,
                ...(componentId ? { componentId } : {}),
            });
            if (res?.success) {
                setOrphans({ codes: [], confirming: false });
            } else {
                setApplyError(res?.error ?? 'Could not remove the unused APIs.');
                setOrphans((o) => ({ ...o, confirming: false }));
            }
        } catch (err) {
            setApplyError(err instanceof Error ? err.message : String(err));
            setOrphans((o) => ({ ...o, confirming: false }));
        }
    };

    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
                    fitContent
                    title="Manage APIs"
                    size="L"
                    onClose={onClose}
                    closeLabel="Cancel"
                    actionButtons={[
                        {
                            label: isApplying ? 'Applying…' : 'Apply',
                            variant: 'accent',
                            onPress: () => {
                                void handleApply();
                            },
                            isDisabled: !isDirty || isApplying,
                        },
                    ]}
                >
                    {/* A plain div, NOT Spectrum's Flex: Flex caps its width at
                        ~450px (root CLAUDE.md gotcha), and inside a size-L dialog
                        the API list is wider than that — so the body overflowed
                        its own container and the modal grew a horizontal
                        scrollbar. */}
                    <div className="manage-apis-body">
                        <Text>
                            Manage Adobe API access for <strong>{componentName}</strong>.
                        </Text>
                        {orphans.codes.length > 0 && (
                            <div className="manage-apis-orphans" data-testid="orphan-notice">
                                <Text>
                                    {orphans.codes.length === 1 ? 'One API is' : `${orphans.codes.length} APIs are`}{' '}
                                    subscribed but required by nothing in this project:{' '}
                                    <strong>{orphans.codes.join(', ')}</strong>.
                                </Text>
                                {orphans.confirming ? (
                                    <div data-testid="orphan-confirm">
                                        <Text>
                                            Removing unsubscribes them from the Adobe workspace. Any
                                            code still in use stays.
                                        </Text>
                                        <Button
                                            variant="negative"
                                            onPress={() => {
                                                void handleRemoveOrphans();
                                            }}
                                        >
                                            Remove
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onPress={() =>
                                                setOrphans((o) => ({ ...o, confirming: false }))
                                            }
                                        >
                                            Keep them
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        variant="secondary"
                                        onPress={() =>
                                            setOrphans((o) => ({ ...o, confirming: true }))
                                        }
                                    >
                                        Remove unused
                                    </Button>
                                )}
                            </div>
                        )}
                        <ManageApisBody
                            onRetry={retry}
                            loadingStage={loadingStage}
                            isLoading={isLoading}
                            loadError={loadError}
                            needsSignIn={needsSignIn}
                            onSignIn={signIn}
                            apis={apis}
                            selected={selected}
                            onToggle={handleToggle}
                        />
                        {applyError && (
                            <Text UNSAFE_className="text-sm text-red-600">{applyError}</Text>
                        )}
                    </div>
                </Modal>
            )}
        </DialogContainer>
    );
}
