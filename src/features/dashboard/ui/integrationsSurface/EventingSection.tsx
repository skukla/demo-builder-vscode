/**
 * EventingSection — the workspace's I/O event providers + registrations,
 * below the integrations grid (AB-6's headful half).
 *
 * WORKSPACE-scoped on purpose, not per-integration: providers and
 * registrations belong to the project's Console workspace, and pinning them
 * to one card's drawer would lie whenever two integrations share the
 * workspace. Lazy: listing costs a Console round-trip (org-wide provider
 * page-walk + credential detect), so nothing loads until the section is
 * expanded — a screen open stays cheap.
 *
 * Deletes post `deleteEventEntity`; the EXTENSION confirms with a native
 * modal naming the entity (same division as the drawer's destructive
 * actions: the webview stays dumb, the confirm lives where the person is).
 */

import { ActionButton, ProgressCircle } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import Delete from '@spectrum-icons/workflow/Delete';
import Refresh from '@spectrum-icons/workflow/Refresh';
import React, { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/vscode-api';

interface EventingListing {
    available: boolean;
    reason?: string;
    providers?: Array<{ id: string; label?: string }>;
    registrations?: Array<{ id: string; name?: string }>;
}

type LoadState = 'collapsed' | 'loading' | 'loaded' | 'failed';

/** One provider or registration row: label, mono id, delete affordance. */
function EventRow({
    kind,
    id,
    label,
    onDelete,
}: {
    kind: 'provider' | 'registration';
    id: string;
    label?: string;
    onDelete: (kind: 'provider' | 'registration', id: string, label?: string) => void;
}): React.ReactElement {
    return (
        <div className="eventing-row" data-testid={`eventing-${kind}-${id}`}>
            <span className="eventing-row-label">{label || id}</span>
            <span className="eventing-row-id">{id}</span>
            <ActionButton
                isQuiet
                aria-label={`Delete ${kind} ${label || id}`}
                onPress={() => onDelete(kind, id, label)}
            >
                <Delete size="S" />
            </ActionButton>
        </div>
    );
}

export function EventingSection(): React.ReactElement {
    const [state, setState] = useState<LoadState>('collapsed');
    const [listing, setListing] = useState<EventingListing | undefined>(undefined);

    const load = useCallback(async (): Promise<void> => {
        setState('loading');
        try {
            const result = await webviewClient.request<EventingListing>('getEventEntities', {});
            setListing(result);
            setState('loaded');
        } catch {
            setState('failed');
        }
    }, []);

    const toggle = useCallback((): void => {
        if (state === 'collapsed') {
            void load();
        } else if (state !== 'loading') {
            setState('collapsed');
        }
    }, [state, load]);

    const handleDelete = useCallback(
        async (kind: 'provider' | 'registration', id: string, label?: string): Promise<void> => {
            const result = await webviewClient
                .request<{ deleted: boolean }>('deleteEventEntity', { kind, id, label })
                .catch(() => undefined);
            if (result?.deleted) {
                void load();
            }
        },
        [load],
    );

    const providers = listing?.providers ?? [];
    const registrations = listing?.registrations ?? [];
    const empty = listing?.available && providers.length === 0 && registrations.length === 0;
    // Named rather than inlined: 3+-operand && chains in JSX trip the
    // complex-expression SOP scan (same convention as IntegrationsScreen).
    const showUnavailable = state === 'loaded' && listing !== undefined && !listing.available;
    const showRows = state === 'loaded' && !empty && Boolean(listing?.available);

    return (
        <section className="eventing-section" aria-label="Event providers">
            <div className="eventing-section-head">
                <ActionButton isQuiet onPress={toggle} aria-expanded={state !== 'collapsed'}>
                    {state === 'collapsed' ? <ChevronRight size="S" /> : <ChevronDown size="S" />}
                    <span className="eventing-section-title">Event providers</span>
                </ActionButton>
                {state === 'loaded' && (
                    <ActionButton isQuiet aria-label="Refresh event providers" onPress={load}>
                        <Refresh size="S" />
                    </ActionButton>
                )}
            </div>

            {state === 'loading' && (
                <div className="eventing-section-body">
                    <ProgressCircle size="S" isIndeterminate aria-label="Loading event providers" />
                </div>
            )}
            {state === 'failed' && (
                <div className="eventing-section-body eventing-section-note">
                    Could not load event providers.
                </div>
            )}
            {showUnavailable && (
                <div className="eventing-section-body eventing-section-note">
                    {listing?.reason}
                </div>
            )}
            {state === 'loaded' && empty && (
                <div className="eventing-section-body eventing-section-note">
                    No event providers or registrations in this workspace. Starter-kit apps manage
                    their own eventing; agent-built apps can add providers here.
                </div>
            )}
            {showRows && (
                <div className="eventing-section-body">
                    {providers.map((p) => (
                        <EventRow
                            key={p.id}
                            kind="provider"
                            id={p.id}
                            label={p.label}
                            onDelete={handleDelete}
                        />
                    ))}
                    {registrations.map((r) => (
                        <EventRow
                            key={r.id}
                            kind="registration"
                            id={r.id}
                            label={r.name}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
