/**
 * FlowStageBody — the Add Integration journey's stage switch: which body the flow
 * hook's current stage renders, and what each one is handed.
 *
 * Split out of {@link AddIntegrationFlowModal} (2026-10-15), which keeps the dialog
 * shell, the footer and the destination line. Routing a stage to its body changes
 * whenever a stage gains an input; the shell does not.
 *
 * @module features/project-creation/ui/components/integration-flow/FlowStageBody
 */

import React, { useMemo } from 'react';
import { isMeshSelected } from '../../steps/tileStatus';
import { ApiPickerStage } from './stages/ApiPickerStage';
import { BlankStage } from './stages/BlankStage';
import { CatalogStage, type UnavailableEntries } from './stages/CatalogStage';
import { CustomStage } from './stages/CustomStage';
import { DestinationStage } from './stages/DestinationStage';
import { KindStage } from './stages/KindStage';
import type { UseIntegrationFlowReturn } from './useIntegrationFlow';
import {
    isPrebuiltIntegration,
    isSeedIntegration,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeAuthSessionState, WizardState } from '@/types/webview';

/** Stable empty selection (avoids the inline-array re-render gotcha). */
const EMPTY_IDS: string[] = [];

/** flow stage id → DestinationStage view, for the four destination stages. */
const DEST_VIEWS = {
    'dest-signin': 'signin',
    'dest-project': 'project',
    'dest-workspace': 'workspace',
    'dest-summary': 'summary',
} as const;

/** What the stage bodies read off the journey's inputs (see the modal's props). */
interface StageBodyInputs {
    state: AdobeAuthSessionState;
    updateState: (updates: Partial<WizardState>) => void;
    meshComponent?: AppBuilderComponentCatalogEntry;
    catalog: AppBuilderComponentCatalogEntry[];
    onSignIn?: () => Promise<unknown>;
    /** Catalog entries that cannot be added here, and what to do instead. */
    unavailable?: UnavailableEntries;
}

/**
 * Renders the stage body the hook's current stage asks for.
 *
 * @param props - the flow hook's state and actions, and the journey's inputs
 * @returns the current stage's body
 */
export function FlowStageBody({
    flow,
    props,
}: {
    flow: UseIntegrationFlowReturn;
    props: StageBodyInputs;
}): React.ReactElement {
    const { stage, draft } = flow;
    const { state, updateState, meshComponent, catalog, onSignIn, unavailable } = props;

    // The catalog prop is the stack-filtered MIXED list: derived meshes, authored
    // integrations, the blank shell, and SEEDS. Only finished integrations belong
    // in the Pre-built gallery — everything else has its own home (meshes on the
    // kind picker, blank + seeds on the Build-custom naming stage), so listing
    // them here offered the same thing twice under two names (reported
    // 2026-08-06; the seed split is the owner's 2026-08-27 decision: the kit "is
    // a Custom App that's built using the starter kit").
    //
    // Derived ONCE and used for both the tile count and the gallery, so the count
    // can never disagree with what the gallery would show.
    const prebuiltCatalog = useMemo(() => catalog.filter(isPrebuiltIntegration), [catalog]);
    const seedCatalog = useMemo(() => catalog.filter(isSeedIntegration), [catalog]);
    const selectedIds = state.selectedAppBuilderComponents ?? EMPTY_IDS;
    if (stage === 'kind') {
        // Availability and already-added stay SEPARATE here: the tile is hidden
        // for a stack with no mesh, but disabled-with-a-reason once the project
        // has one. They were collapsed into one boolean until 2026-08-04, which
        // is why the tile could only ever vanish.
        const meshAvailable = meshComponent !== undefined;
        const meshAlreadyAdded = meshAvailable && isMeshSelected(state, meshComponent.id);
        return (
            <KindStage
                meshAvailable={meshAvailable}
                meshAlreadyAdded={meshAlreadyAdded}
                catalogCount={prebuiltCatalog.length}
                kind={draft.kind}
                onPickKind={flow.pickKind}
            />
        );
    }
    if (stage === 'source-catalog') {
        // The picked entry gets the same naming field the blank path uses —
        // prefilled with the entry's name, so a kept default commits the
        // classic catalog identity and an edited name a named instance.
        return (
            <CatalogStage
                catalog={prebuiltCatalog}
                unavailable={unavailable}
                selectedId={draft.catalogId}
                onPick={flow.pickCatalog}
                label={draft.label}
                onLabelChange={flow.setLabel}
            />
        );
    }
    if (stage === 'source-custom') {
        // A cleared/invalid URL emits undefined, which clears the draft source
        // and re-disables Continue.
        return (
            <CustomStage
                selectedIds={selectedIds}
                source={draft.customSource}
                onSourceChange={flow.setCustomSource}
                label={draft.label}
                onLabelChange={flow.setLabel}
            />
        );
    }
    if (stage === 'source-blank') {
        // The instance-naming stage: a valid, non-colliding name emits the
        // {id, name} instance into the draft (the stage gate); anything else
        // clears it and re-disables Continue. Pre-built entries double as
        // SEEDS here — starting points a custom build clones instead of the
        // blank shell.
        return (
            <BlankStage
                seeds={seedCatalog}
                seedId={draft.seedId}
                selectedIds={selectedIds}
                onSeedChange={flow.setSeed}
                label={draft.label}
                onLabelChange={flow.setLabel}
            />
        );
    }
    if (stage === 'api-access') {
        // Reached ONLY by custom/import apps (blank shell / imported repo): they can
        // need ANY entitled API, and the user often knows which up front — so give
        // them the INTERACTIVE picker (already-covered APIs come back locked). Mesh
        // and catalog have deterministic APIs and never route here (their destination
        // stage is terminal), so this is unconditionally the picker.
        return (
            <ApiPickerStage
                onSignIn={onSignIn}
                componentIds={selectedIds}
                selected={draft.selectedApis ?? EMPTY_IDS}
                onToggle={flow.toggleApi}
            />
        );
    }
    return (
        <DestinationStage
            state={state}
            updateState={updateState}
            view={DEST_VIEWS[stage]}
            pendingProject={draft.pendingProject}
            pendingWorkspace={draft.pendingWorkspace}
            onPendingProject={flow.setPendingProject}
            onPendingWorkspace={flow.setPendingWorkspace}
            onPhaseRunningChange={flow.setPhaseRunning}
        />
    );
}
