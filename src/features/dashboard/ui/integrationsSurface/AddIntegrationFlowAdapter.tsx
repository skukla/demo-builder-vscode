/**
 * AddIntegrationFlowAdapter — the wizard's Add Integration journey, on a LIVE project.
 *
 * Renders the wizard's own {@link AddIntegrationFlowModal} rather than a
 * second, diverging picker, so both surfaces present one add experience: the
 * same kind picker, catalog gallery, custom-URL door, blank-instance naming and
 * API picker.
 *
 * Reuse is possible because that modal's wizard dependency is narrow — it commits
 * through exactly two callbacks (`Pick<UseProjectBuilderReturn,
 * 'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'>`). This file
 * supplies both, shaped from the live project instead of a wizard draft.
 *
 * What it does NOT get to narrow is `state`/`updateState`. The components inside
 * that modal (the project and workspace pickers) are state-BACKED: they write
 * their fetched lists into wizard state and read them back out. So this adapter
 * supplies a real session store — derived-from-project values with every write
 * layered on top — not a filter over the fields it happens to care about.
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

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { AddIntegrationFlowModal } from '@/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal';
import { buildReservedIds } from '@/features/project-creation/ui/components/integration-flow/instanceId';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import type { WizardState } from '@/types/webview';
import type {
    AddAppBuilderComponentRequestPayload,
    DestinationRef,
    SetProjectDestinationRequestPayload,
} from '@/types/webviewRequests';

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
    /**
     * The destination's display TITLES. `deriveStageOrder` only reads the ids as
     * booleans, but the dest-summary STAGE renders `adobeProject.title` — supply
     * ids alone and the user sees two labelled rows with no values.
     */
    adobeProjectTitle?: string;
    adobeWorkspaceTitle?: string;
    /** The IMS org. `isAdobeSignedIn` reads adobeAuth + adobeOrg — NOT the project id. */
    adobeOrgId?: string;
    /**
     * Which journey the modal runs. `'destination'` renders only the
     * sign-in → project → workspace stages, which is what the Integrations
     * header's `Change` needs; `'add'` is the full journey.
     */
    mode?: 'add' | 'destination';
}

/** Post an add and close — the runner reports progress on the status channel. */
function postAdd(payload: AddAppBuilderComponentRequestPayload): void {
    webviewClient.postMessage('addAppBuilderComponent', payload);
}

export function AddIntegrationFlowAdapter({
    isOpen,
    onClose,
    catalog,
    appBuilderComponents,
    adobeProjectId,
    adobeWorkspaceId,
    adobeProjectTitle,
    adobeWorkspaceTitle,
    adobeOrgId,
    mode = 'add',
}: AddIntegrationFlowAdapterProps): React.ReactElement {
    // A REAL state store for the modal session, not a filter.
    //
    // The wizard components this modal hosts are state-BACKED, not just
    // state-reading: `useSelectionStep` writes fetched items into
    // `state[cacheKey]` through updateState and reads its list straight back out.
    // An updateState that kept only the keys this adapter cared about therefore
    // broke the pickers outright — the project picker fetched 726 projects, wrote
    // them into a store that dropped them, and rendered "No Projects Found" in the
    // same instant (2026-08-03). The wizard host passes its real state store,
    // which is why the identical picker works there.
    //
    // So: keep EVERY write, and layer it over the values derived from the live
    // project. Destination writes are session-scoped — they steer the modal's own
    // stages and context line; persisting a changed destination to the project is
    // the page-level destination control's job, not this adapter's.
    const [overrides, setOverrides] = useState<Partial<WizardState>>({});

    // The API picks, mirrored SYNCHRONOUSLY.
    //
    // `commitSelection` records picks and then posts the add in the same tick, so
    // a setState-backed read here would still see the previous render's value and
    // post without them. A ref updated inside updateState is current by the time
    // the builder callback runs. (The ordering in useIntegrationFlow was fixed too;
    // both halves are needed — ordering alone still loses the React batch.)
    const apiPicksRef = useRef<Record<string, string[]>>({});

    // The committed destination, mirrored synchronously. `updateState` receives the
    // project and the workspace in separate commits, and the post fires on the
    // second — a setState-backed read would still see the previous render's value.
    const destinationRef = useRef<{ project?: DestinationRef; workspace?: DestinationRef }>({});

    const updateState = useCallback(
        (updates: Partial<WizardState>): void => {
            if (updates.selectedConsoleApis) {
                apiPicksRef.current = updates.selectedConsoleApis as Record<string, string[]>;
            }
            if (updates.adobeProject) destinationRef.current.project = updates.adobeProject;
            if (updates.adobeWorkspace) destinationRef.current.workspace = updates.adobeWorkspace;

            // Continue off `dest-workspace` commits the workspace, which is the
            // terminal step of the destination journey — so this is where the choice
            // stops being local render state and reaches `project.adobe`.
            //
            // Without this the whole feature was inert: the handler, the Change
            // control and the migration each worked in isolation while picking a
            // destination did nothing at all (found live 2026-08-07).
            const { project, workspace } = destinationRef.current;
            if (mode === 'destination' && updates.adobeWorkspace && project && workspace) {
                webviewClient.postMessage('setProjectDestination', {
                    project,
                    workspace,
                } satisfies SetProjectDestinationRequestPayload);
            }

            setOverrides((current) => ({ ...current, ...updates }));
        },
        [mode],
    );

    // Memoized: `state` derives from these, and a fresh array each render would
    // give the pickers a new `state` identity on every render — re-subscribing
    // their message listeners each time.
    const { integrationIds, allComponentIds } = useMemo(() => {
        const entries = Object.entries(appBuilderComponents ?? {});
        return {
            integrationIds: entries
                .filter(([, entry]) => entry.kind === 'integration')
                .map(([id]) => id),
            allComponentIds: entries.map(([id]) => id),
        };
    }, [appBuilderComponents]);

    // Passed unconditionally: the flow derives `meshAvailable` from its presence and
    // `meshAlreadyAdded` from the id list below, which is what hides the option once
    // a mesh exists. Withholding the component instead also made it read as not
    // selected, which left a mesh-only project reporting NO references and stopped
    // the destination collapsing.
    const meshComponent = useMemo(() => catalog.find((entry) => entry.kind === 'mesh'), [catalog]);
    const blankComponent = useMemo(() => catalog.find((entry) => entry.blank === true), [catalog]);

    const state = useMemo(
        () => ({
            // A live project IS authenticated and org-scoped — the surface only
            // renders with hasAdobeContext. Without BOTH of these isAdobeSignedIn()
            // is false and the flow walks sign-in → project → workspace instead of
            // collapsing to the summary.
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeOrg: adobeOrgId ? { id: adobeOrgId } : undefined,
            adobeProject: adobeProjectId
                ? { id: adobeProjectId, title: adobeProjectTitle }
                : undefined,
            adobeWorkspace: adobeWorkspaceId
                ? { id: adobeWorkspaceId, title: adobeWorkspaceTitle }
                : undefined,
            // ALL keyed ids, mesh included: this drives the custom-source duplicate
            // guard, the "mesh already added" rule (`isMeshSelected` reads these —
            // mesh catalog ids ARE the keyed component ids), AND `hasIntegrations`
            // (something references the destination), which gates the collapse.
            selectedAppBuilderComponents: allComponentIds,
            // Everything the modal session has written — caches the pickers read
            // back, API picks, a changed destination — layered on top.
            ...overrides,
        }),
        [
            adobeOrgId,
            adobeProjectId,
            adobeWorkspaceId,
            adobeProjectTitle,
            adobeWorkspaceTitle,
            allComponentIds,
            overrides,
        ],
    );

    const reservedIds = useMemo(
        () =>
            buildReservedIds({
                selectedIntegrationIds: integrationIds,
                sourceIds: integrationIds,
                catalogIds: catalog.map((entry) => entry.id),
                selectedAddons: [],
            }),
        [integrationIds, catalog],
    );

    // The wizard stages these into its draft; here each one deploys.
    const builder = useMemo(
        () => ({
            onAppBuilderComponentToggle: (id: string, selected: boolean): void => {
                if (selected) {
                    postAdd({ id, apis: apiPicksRef.current[id] });
                }
            },
            onAddCustomAppBuilderComponent: (
                source: { owner: string; repo: string },
                instance?: { id: string; name: string },
            ): void => {
                // BOTH halves of the instance identity: the name the user typed
                // AND the collision-checked id. Sending only the name let the id
                // fall back to `${owner}-${repo}`, so the card came back titled
                // "skukla-app-builder-shell" instead of what they named it.
                // Picks key under the instance id for a named blank, else the
                // owner-repo slug useProjectBuilder derives — the same key
                // useIntegrationFlow just wrote them under.
                const picksKey = instance ? instance.id : `${source.owner}-${source.repo}`;
                postAdd({
                    source,
                    ...(instance ? { name: instance.name, instanceId: instance.id } : {}),
                    apis: apiPicksRef.current[picksKey],
                });
            },
        }),
        [],
    );

    // The DASHBOARD webview registers `reAuthenticate` (not the wizard's
    // `authenticate`); it awaits the browser sign-in and returns when done, so the
    // picker can re-fetch straight after.
    const signIn = useCallback(
        () => webviewClient.request('reAuthenticate').catch(() => undefined),
        [],
    );

    return (
        <AddIntegrationFlowModal
            isOpen={isOpen}
            onClose={onClose}
            mode={mode}
            state={state}
            updateState={updateState}
            meshComponent={meshComponent}
            catalog={catalog}
            blankComponent={blankComponent}
            reservedIds={reservedIds}
            builder={builder}
            onSignIn={signIn}
        />
    );
}
