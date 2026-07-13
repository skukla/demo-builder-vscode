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

import { DialogContainer, Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { ApiAccessPicker, type ApiAccessOption } from '@/core/ui/components/selection';
import { Modal } from '@/core/ui/components/ui/Modal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { CloudGrouping } from '@/types/adobeApis';

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

/** No suggested group here — the dashboard has no catalog context for the row. */
const HELPER_TEXT =
    'Check to add an API, uncheck to remove one. Locked entries are always-on and ' +
    'can’t be removed.';

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Compact fetch states (inline, not tall-centered) around the shared picker. */
function ManageApisBody({
    isLoading,
    loadError,
    apis,
    selected,
    onToggle,
}: {
    isLoading: boolean;
    loadError: string | null;
    apis: ApiAccessOption[];
    selected: string[];
    onToggle: (code: string) => void;
}): React.ReactElement {
    if (isLoading) {
        return (
            <Flex alignItems="center" gap="size-150">
                <ProgressCircle aria-label="Loading Adobe APIs" isIndeterminate size="S" />
                <Text>Loading Adobe APIs…</Text>
            </Flex>
        );
    }
    if (loadError) {
        return <Text UNSAFE_className="text-sm text-red-600">{loadError}</Text>;
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
    /** The OPTIONAL extras: seeded from the project's existing added set, then
        edited (check adds, uncheck removes). Managed codes are locked, never here. */
    const [selected, setSelected] = useState<string[]>([]);
    /** The set as loaded — Apply is a no-op (disabled) until this changes. */
    const [initial, setInitial] = useState<string[]>([]);
    const [isApplying, setIsApplying] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        // Each open starts fresh: prior picks/errors must not leak between rows.
        let cancelled = false;
        setApis([]);
        setSelected([]);
        setInitial([]);
        setLoadError(null);
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
    }, [isOpen]);

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
                    size="M"
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
                            isLoading={isLoading}
                            loadError={loadError}
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
