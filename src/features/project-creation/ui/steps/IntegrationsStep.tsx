/**
 * IntegrationsStep — the Integrations area body: RESULTS ONLY.
 *
 * The center column is one collapsed {@link IntegrationResultRow} per configured
 * integration (resolved purely from wizard state by {@link resolveIntegrationRows},
 * so a PACKAGE-SEEDED mesh — selected via the dependency mirror key only — surfaces
 * automatically as a needs-setup row), an empty state when nothing is configured,
 * and one accent "Add Integration" launchpad. ALL configuration lives in the
 * {@link AddIntegrationFlowModal} journey: the Add button opens it in `add` mode;
 * a row's Set up / Change opens it in `destination` mode. There is NO sub-step
 * rail — the Build step's footer owns the Continue gate.
 *
 * Remove routing: a mesh row routes through the mesh dual-flow toggle
 * ({@link useProjectBuilder.onAppBuilderComponentToggle}, clearing BOTH selection
 * keys); every other row routes through `onRemoveAppBuilderComponent` (selection +
 * source + API picks). Mesh API enablement runs INSIDE the modal journey (its
 * api-access stage); the outcome lands here via `onMeshEnableResult` and the mesh
 * row's embedded {@link MeshApiEnableRow} adopts it as `initialResult` (no
 * duplicate request). A mesh that never walked the modal enable — package-seeded
 * "Set up" or edit seeding — still auto-runs on the row once the destination
 * commits.
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import { getAvailableAppBuilderComponents } from '../../services/appBuilderComponentCatalogLoader';
import {
    AddIntegrationFlowModal,
    IntegrationResultRow,
    MeshApiEnableRow,
    resolveIntegrationRows,
    type EnsureResult,
    type FlowMode,
    type IntegrationRow,
} from '../components/integration-flow';
import { meshComponentForStack } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** Stable empty defaults for catalog props (avoids the infinite-re-render gotcha). */
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

export interface IntegrationsStepProps extends BaseStepProps {
    /** Available demo packages (catalog data; drives mesh availability). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data; drives mesh availability). */
    stacks?: Stack[];
}

/** The committed "Project · Workspace" reference, or undefined until both commit. */
function destinationLabelFor(state: WizardState): string | undefined {
    const project = state.adobeProject;
    const workspace = state.adobeWorkspace;
    if (!project?.id || !workspace?.id) return undefined;
    return `${project.title ?? project.name} · ${workspace.title ?? workspace.name}`;
}

/** The zero-rows empty state (copy only; the Add button renders regardless). */
function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
    return (
        <div className="int-results-empty">
            <div className="int-results-empty-title">No integrations yet.</div>
            <div className="int-results-empty-copy">
                Add an API Mesh, a pre-built integration, or your own App Builder app — each deploys
                to a shared Adobe I/O project and workspace.
            </div>
            <div className="int-results-empty-action">
                <Button variant="accent" onPress={onAdd}>
                    Add Integration
                </Button>
            </div>
        </div>
    );
}

/**
 * The Integrations area body: result rows + the Add Integration launchpad.
 *
 * @param props - Standard step props plus the package + stack catalog
 * @returns The Integrations surface
 */
export function IntegrationsStep({
    state,
    updateState,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
}: IntegrationsStepProps): React.ReactElement {
    const builder = useProjectBuilder(state, updateState, { packages, stacks });
    const { onAppBuilderComponentToggle, onRemoveAppBuilderComponent } = builder;

    // The one modal, opened in 'add' (launchpad) or 'destination' (row Set up/Change) mode.
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState<FlowMode>('add');
    const openAdd = useCallback((): void => {
        setMode('add');
        setModalOpen(true);
    }, []);
    const openDestination = useCallback((): void => {
        setMode('destination');
        setModalOpen(true);
    }, []);
    const closeModal = useCallback((): void => setModalOpen(false), []);

    // The modal's in-flow mesh enable outcome; the mesh row adopts it as
    // `initialResult` so it renders the result instead of re-running.
    const [meshEnableResult, setMeshEnableResult] = useState<EnsureResult | undefined>(undefined);

    const meshComponent = useMemo(
        () => meshComponentForStack(state, packages, stacks),
        [state, packages, stacks],
    );

    // The selected stack (prop catalog) — drives the integration catalog + mesh
    // enablement axes. The pre-built catalog is empty when no stack is committed.
    const stack = useMemo(
        () => stacks.find((candidate) => candidate.id === state.selectedStack),
        [stacks, state.selectedStack],
    );
    const catalog = useMemo<AppBuilderComponentCatalogEntry[]>(
        () =>
            getAvailableAppBuilderComponents(stack?.backend ?? '', stack?.frontend ?? '').filter(
                (entry) => entry.kind === 'integration',
            ),
        [stack],
    );

    const rows = useMemo(
        () => resolveIntegrationRows(state, meshComponent, catalog),
        [state, meshComponent, catalog],
    );
    const destinationLabel = destinationLabelFor(state);

    const onRemoveRow = useCallback(
        (row: IntegrationRow): void => {
            // Mesh removal MUST route through the dual-flow toggle so the legacy
            // dependency mirror key clears with the selection.
            if (row.kind === 'mesh' && meshComponent) {
                onAppBuilderComponentToggle(meshComponent.id, false);
                return;
            }
            onRemoveAppBuilderComponent(row.id);
        },
        [meshComponent, onAppBuilderComponentToggle, onRemoveAppBuilderComponent],
    );

    return (
        <div className="commerce-body">
            <div className="step-nav">
                <div className="step-nav-area">Integrations</div>
            </div>
            <div className="step-view">
                <div
                    className={
                        rows.length === 0
                            ? 'step-view-anim int-results int-results--empty'
                            : 'step-view-anim int-results'
                    }
                >
                    {rows.length === 0 && <EmptyState onAdd={openAdd} />}
                    {rows.map((row) => (
                        <IntegrationResultRow
                            key={row.id}
                            row={row}
                            destinationLabel={destinationLabel}
                            onSetUpDestination={openDestination}
                            onChangeDestination={openDestination}
                            onRemove={() => onRemoveRow(row)}
                            meshEnableSlot={
                                row.kind === 'mesh' ? (
                                    <MeshApiEnableRow
                                        orgId={state.adobeOrg?.id}
                                        projectId={state.adobeProject?.id}
                                        workspaceId={state.adobeWorkspace?.id}
                                        backendId={stack?.backend}
                                        frontendId={stack?.frontend}
                                        initialResult={meshEnableResult}
                                    />
                                ) : undefined
                            }
                        />
                    ))}
                    {rows.length > 0 && (
                        <div className="int-results-add">
                            <Button variant="accent" onPress={openAdd}>
                                Add Integration
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            <AddIntegrationFlowModal
                isOpen={modalOpen}
                onClose={closeModal}
                mode={mode}
                state={state}
                updateState={updateState}
                meshComponent={meshComponent}
                catalog={catalog}
                builder={builder}
                meshBackendId={stack?.backend}
                meshFrontendId={stack?.frontend}
                onMeshEnableResult={setMeshEnableResult}
            />
        </div>
    );
}
