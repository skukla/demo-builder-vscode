/**
 * AddIntegrationFlowAdapter — the wizard's Add Integration journey, on a LIVE project.
 *
 * Renders the wizard's own {@link AddIntegrationFlowModal} rather than a
 * second, diverging picker, so both surfaces present one add experience: the
 * same kind picker, catalog gallery, custom-URL door, blank-instance naming and
 * API picker.
 *
 * Reuse is possible because that modal's wizard dependency is narrow — it reads
 * four fields and commits through exactly two callbacks
 * (`Pick<UseProjectBuilderReturn, 'onAppBuilderComponentToggle' |
 * 'onAddCustomAppBuilderComponent'>`). This file supplies both, shaped from the
 * live project instead of a wizard draft.
 *
 * The ONE behavioural difference, and it is the point: the wizard STAGES a
 * selection to be built when the project is created; here the commit deploys
 * immediately against the live project via `addAppBuilderComponent`.
 *
 * Stage sequencing needs no special-casing. `deriveStageOrder` already collapses
 * the destination to a single informational `dest-summary` once the destination
 * is committed, the session is live, and something references it — all true on a
 * deployed project — and it appends the API picker only for custom/blank kinds,
 * which is the same rule the wizard follows.
 *
 * @module features/dashboard/ui/integrationsSurface/AddIntegrationFlowAdapter
 */

import React, { useCallback, useMemo, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { AddIntegrationFlowModal } from '@/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal';
import { buildReservedIds } from '@/features/project-creation/ui/components/integration-flow/instanceId';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

export interface AddIntegrationFlowAdapterProps {
    isOpen: boolean;
    onClose: () => void;
    /** Stack-filtered catalog (the same list the wizard's gallery renders). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The live project's keyed components — the collision domain + mesh check. */
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    /** The live project's committed Adobe destination ids. */
    adobeProjectId?: string;
    adobeWorkspaceId?: string;
    /** The IMS org. `isAdobeSignedIn` reads adobeAuth + adobeOrg — NOT the project id. */
    adobeOrgId?: string;
}

/** Post an add and close — the runner reports progress on the status channel. */
function postAdd(payload: Record<string, unknown>): void {
    webviewClient.postMessage('addAppBuilderComponent', payload);
}

export function AddIntegrationFlowAdapter({
    isOpen,
    onClose,
    catalog,
    appBuilderComponents,
    adobeProjectId,
    adobeWorkspaceId,
    adobeOrgId,
}: AddIntegrationFlowAdapterProps): React.ReactElement {
    // The modal writes destination/API picks through updateState. On a live
    // project the destination is already fixed, so those writes are inert — held
    // locally so the modal stays a controlled component rather than being
    // silently dropped.
    const [apiPicks, setApiPicks] = useState<Record<string, string[]>>({});

    const entries = Object.entries(appBuilderComponents ?? {});
    const integrationIds = entries
        .filter(([, entry]) => entry.kind === 'integration')
        .map(([id]) => id);
    const allComponentIds = entries.map(([id]) => id);

    // Passed unconditionally: `meshKindOffered` = meshAvailable && !meshSelected,
    // so the id list below is what hides the option once a mesh exists. Withholding
    // the component instead also made `meshSelected` false, which left a mesh-only
    // project reporting NO references and stopped the destination collapsing.
    const meshComponent = useMemo(
        () => catalog.find((entry) => entry.kind === 'mesh'),
        [catalog],
    );
    const blankComponent = useMemo(() => catalog.find((entry) => entry.blank === true), [catalog]);

    const state = useMemo(
        () => ({
            // A live project IS authenticated and org-scoped — the surface only
            // renders with hasAdobeContext. Without BOTH of these isAdobeSignedIn()
            // is false and the flow walks sign-in → project → workspace instead of
            // collapsing to the summary.
            adobeAuth: { isAuthenticated: true },
            adobeOrg: adobeOrgId ? { id: adobeOrgId } : undefined,
            adobeProject: adobeProjectId ? { id: adobeProjectId } : undefined,
            adobeWorkspace: adobeWorkspaceId ? { id: adobeWorkspaceId } : undefined,
            // ALL keyed ids, mesh included: this drives the custom-source duplicate
            // guard, the "mesh already added" rule, AND `hasIntegrations` (something
            // references the destination), which gates the collapse.
            selectedAppBuilderComponents: allComponentIds,
            selectedConsoleApis: apiPicks,
        }),
        [adobeOrgId, adobeProjectId, adobeWorkspaceId, allComponentIds, apiPicks],
    );

    const updateState = useCallback((updates: Record<string, unknown>): void => {
        if (updates.selectedConsoleApis) {
            setApiPicks(updates.selectedConsoleApis as Record<string, string[]>);
        }
        // adobeProject / adobeWorkspace writes are inert here: the live project's
        // destination is fixed and the flow only reaches dest-summary.
    }, []);

    const reservedIds = useMemo(
        () =>
            buildReservedIds({
                selectedIntegrationIds: integrationIds,
                sourceIds: integrationIds,
                catalogIds: catalog.map((entry) => entry.id),
                selectedAddons: [],
                selectedOptionalDependencies: [],
            } as never),
        [integrationIds, catalog],
    );

    // The wizard stages these into its draft; here each one deploys.
    const builder = useMemo(
        () => ({
            onAppBuilderComponentToggle: (id: string, selected: boolean): void => {
                if (selected) {
                    postAdd({ id });
                }
            },
            onAddCustomAppBuilderComponent: (
                source: { owner: string; repo: string },
                instance?: { id: string; name: string },
            ): void => {
                postAdd({ source, ...(instance ? { name: instance.name } : {}) });
            },
        }),
        [],
    );

    return (
        <AddIntegrationFlowModal
            isOpen={isOpen}
            onClose={onClose}
            mode="add"
            state={state as never}
            updateState={updateState as never}
            meshComponent={meshComponent as never}
            catalog={catalog}
            blankComponent={blankComponent}
            reservedIds={reservedIds}
            builder={builder as never}
        />
    );
}
