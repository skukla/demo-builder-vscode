/**
 * How the Add Integration modal's commits become adds on a LIVE project.
 *
 * The modal commits through two `useProjectBuilder` callbacks. The wizard's stage a
 * selection to be built at creation; these post `addAppBuilderComponent` at once and
 * open its progress modal. Split out of {@link AddIntegrationFlowAdapter}
 * (2026-10-15), which keeps the modal's session state and destination wiring.
 *
 * Everything it reads arrives as refs the adapter keeps current: the callbacks are
 * built once, and a value captured at build time would be stale by the commit.
 *
 * @module features/dashboard/ui/integrationsSurface/liveAddBuilder
 */

import type { MutableRefObject } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { preparesStoreOnAdd } from '@/features/app-builder/services/storePreparation/fixReach';
import { copyForAdd } from '@/features/components/services/appBuilderComponentLinks';
import type { UseProjectBuilderReturn } from '@/features/project-creation/ui/steps/useProjectBuilder';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import type {
    AddAppBuilderComponentRequestPayload,
    DestinationRef,
} from '@/types/webviewRequests';

/** What the commits read at commit time, each kept current by the adapter. */
interface LiveAddRefs {
    /** The stack-filtered catalog. */
    catalog: MutableRefObject<AppBuilderComponentCatalogEntry[]>;
    /** The live project's keyed components. */
    components: MutableRefObject<Record<string, AppBuilderComponentState> | undefined>;
    /** The API picks, by the id they were made for. */
    apiPicks: MutableRefObject<Record<string, string[]>>;
    /** The destination the journey committed. */
    destination: MutableRefObject<{ project?: DestinationRef; workspace?: DestinationRef }>;
    /** Whether the live project already deploys somewhere. */
    hadDestination: MutableRefObject<boolean>;
    /** Open the add's progress modal. */
    onAddStarted: MutableRefObject<
        ((id: string, name: string, payload?: Record<string, unknown>) => void) | undefined
    >;
    /**
     * Hand an add that prepares the store (the ERP integration) to the screen's confirm
     * instead of sending it (owner, 2026-10-22). Absent, it is sent at once.
     */
    onConfirmAdd?: MutableRefObject<
        ((target: { id: string; name: string; payload: AddAppBuilderComponentRequestPayload }) => void) | undefined
    >;
}

/**
 * The destination an add carries: the one its own steps chose, only when the project
 * had none. Without it the add ran with no Adobe project and its workspace was made in
 * the project cached from earlier (Justrite's, 2026-10-15).
 */
function chosenDestination(
    chosen: { project?: DestinationRef; workspace?: DestinationRef },
    hadDestination: boolean,
): Pick<AddAppBuilderComponentRequestPayload, 'destination'> {
    const { project, workspace } = chosen;
    return !hadDestination && project?.id && workspace?.id ? { destination: { project, workspace } } : {};
}

/** Post an add whose steps narrate to the progress modal. Shared with the ERP integration's confirm. */
export function postAdd(payload: AddAppBuilderComponentRequestPayload): void {
    webviewClient.postMessage('addAppBuilderComponent', { ...payload, progress: 'modal' });
}

/**
 * The two commit callbacks the modal calls, each posting an add.
 *
 * @param refs - what the commits read at commit time
 * @returns the callbacks, in the shape the modal's `builder` prop takes
 */
export function liveAddBuilder(
    refs: LiveAddRefs,
): Pick<UseProjectBuilderReturn, 'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'> {
    return {
        onAppBuilderComponentToggle: (
            id: string,
            selected: boolean,
            displayName?: string,
        ): void => {
            if (selected) {
                // `displayName` names the pair's bound SYSTEM (`pairNames`; the
                // integration keeps its catalog name) while the entry keeps its
                // catalog identity, so the pair still arrives together.
                const entry = refs.catalog.current.find((candidate) => candidate.id === id);
                // A kind the project already has is added as a numbered copy
                // (AB-23). Named HERE, by the same rule the add handler applies,
                // so the progress modal opens under the copy's id rather than the
                // first one's.
                const copy =
                    entry &&
                    copyForAdd({ appBuilderComponents: refs.components.current }, entry, refs.catalog.current);
                const payload = {
                    id,
                    ...(copy ? { instanceId: copy.id } : {}),
                    apis: refs.apiPicks.current[id],
                    name: displayName,
                    ...chosenDestination(refs.destination.current, refs.hadDestination.current),
                };
                const addedId = copy?.id ?? id;
                const addedName = displayName ?? copy?.name ?? entry?.name ?? id;
                // The ERP integration's add prepares the store: the SC confirms what it
                // changes first, and the confirm sends it.
                const confirmAdd = refs.onConfirmAdd?.current;
                if (entry && confirmAdd && preparesStoreOnAdd(entry)) {
                    confirmAdd({ id: addedId, name: addedName, payload });
                    return;
                }
                postAdd(payload);
                // The payload rides along so the modal's Retry re-sends this
                // exact add rather than a deploy of something that may never
                // have been persisted.
                refs.onAddStarted.current?.(addedId, addedName, payload);
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
            const payload = {
                source,
                ...(instance ? { name: instance.name, instanceId: instance.id } : {}),
                apis: refs.apiPicks.current[picksKey],
                ...chosenDestination(refs.destination.current, refs.hadDestination.current),
            };
            postAdd(payload);
            refs.onAddStarted.current?.(picksKey, instance?.name ?? source.repo, payload);
        },
    };
}
