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

import { DialogContainer, Flex, Text } from '@adobe/react-spectrum';
import Key from '@spectrum-icons/workflow/Key';
import Login from '@spectrum-icons/workflow/Login';
import React, { useCallback, useEffect, useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
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
    /** The integration id whose API access is being managed (named in the copy). */
    componentName: string;
    /** Called on Cancel/dismiss and after a successful Apply. */
    onClose: () => void;
}

/**
 * Reserved height for the loading/error views so the modal does not resize when
 * the list lands. A plain px value: Spectrum's dimension tokens top out well
 * below this, and `size-3600` is not one of them.
 */
const FEEDBACK_HEIGHT = '320px';

/** Helper copy above the dashboard's Manage APIs list. */
const HELPER_TEXT =
    'Check to add an API, uncheck to remove one. Locked entries are always-on and ' +
    'can’t be removed.';

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
    // Loading and failure both fill a RESERVED height and center — the house
    // treatment, and the same one the wizard's picker uses for this identical
    // fetch. A small inline spinner left-aligned in a size-L modal collapsed the
    // dialog to a sliver and left the body looking empty. The reserved height
    // also stops the modal resizing when the list lands.
    if (isLoading) {
        return (
            <CenteredFeedbackContainer height={FEEDBACK_HEIGHT}>
                <LoadingDisplay
                    size="L"
                    message="Loading Adobe APIs…"
                    subMessage={loadingStage}
                    helperText="This can take up to a minute"
                />
            </CenteredFeedbackContainer>
        );
    }
    // Signed out is not retryable — Retry re-runs the same unauthenticated call.
    // AdobeAuthStep's treatment: a StatusDisplay whose action STARTS a sign-in.
    if (needsSignIn) {
        return (
            <CenteredFeedbackContainer height={FEEDBACK_HEIGHT}>
                <StatusDisplay
                    variant="info"
                    height="100%"
                    icon={<Key size="L" UNSAFE_className="text-gray-500" />}
                    title="Sign in to Adobe"
                    message="Your Adobe session has ended. Sign in to manage this app's API access."
                    actions={
                        onSignIn
                            ? [
                                  {
                                      label: 'Sign In with Adobe',
                                      icon: <Login size="S" />,
                                      variant: 'accent',
                                      onPress: () => void onSignIn().then(onRetry),
                                  },
                              ]
                            : []
                    }
                />
            </CenteredFeedbackContainer>
        );
    }
    if (loadError) {
        // A retryable failure, not dead-end red text — matching the wizard picker,
        // where the same fetch failing offers the same way out.
        return (
            <CenteredFeedbackContainer height={FEEDBACK_HEIGHT}>
                <StatusDisplay
                    variant="error"
                    height="100%"
                    title="Couldn't load Adobe APIs"
                    message={loadError}
                    actions={onRetry ? [{ label: 'Retry', variant: 'accent', onPress: onRetry }] : []}
                />
            </CenteredFeedbackContainer>
        );
    }
    return (
        <ApiAccessPicker
            apis={apis}
            selected={selected}
            onToggle={onToggle}
            helperText={HELPER_TEXT}
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
            .request<ListConsoleApisResponse>('listConsoleApis')
            .then((res) => {
                if (cancelled) return;
                if (res?.success && res.data) {
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
    }, [isOpen, reloadKey]);

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

    return (
        <DialogContainer onDismiss={onClose}>
            {isOpen && (
                <Modal
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
                    <Flex direction="column" gap="size-150">
                        <Text>
                            Manage Adobe API access for <strong>{componentName}</strong>.
                        </Text>
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
                    </Flex>
                </Modal>
            )}
        </DialogContainer>
    );
}
