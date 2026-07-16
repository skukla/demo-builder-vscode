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
 * source + API picks). The modal provisions NOTHING — a mesh commits on the
 * modal's destination step, and every integration's APIs (mesh included) are
 * subscribed at the build, not in-modal — so this step is PURELY VISUAL: every row
 * just lists its provisioned APIs by name via the row's uniform "APIs in use"
 * line, and never triggers a subscribe.
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import { getAvailableAppBuilderComponents } from '../../services/appBuilderComponentCatalogLoader';
import {
    AddIntegrationFlowModal,
    buildReservedIds,
    IntegrationResultRow,
    RenameIntegrationModal,
    resolveIntegrationRows,
    type ApiEditTarget,
    type BlankInstance,
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
/** Stable empty string-array default (API picks seed, reserved-id inputs). */
const EMPTY_PICKS: string[] = [];

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
                Add an API Mesh, a pre-built integration, or your own custom integration — each
                deploys to a shared Adobe I/O project and workspace.
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
    const {
        onAppBuilderComponentToggle,
        onRemoveAppBuilderComponent,
        onRenameAppBuilderComponent,
    } = builder;

    // The one modal, opened in 'add' (launchpad), 'destination' (row Set up/Change),
    // or 'api-edit' (a custom/import row's APIs "Change" → re-open the picker).
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState<FlowMode>('add');
    // The row being API-edited (mode 'api-edit' only) — seeds the picker with its
    // current picks; passed to the modal only in that mode.
    const [editTarget, setEditTarget] = useState<ApiEditTarget | undefined>(undefined);
    const openAdd = useCallback((): void => {
        setMode('add');
        setModalOpen(true);
    }, []);
    const openDestination = useCallback((): void => {
        setMode('destination');
        setModalOpen(true);
    }, []);
    const openEditApis = useCallback(
        (row: IntegrationRow): void => {
            setEditTarget({
                componentId: row.id,
                kind: row.kind,
                picks: state.selectedConsoleApis?.[row.id] ?? EMPTY_PICKS,
            });
            setMode('api-edit');
            setModalOpen(true);
        },
        [state.selectedConsoleApis],
    );
    const closeModal = useCallback((): void => setModalOpen(false), []);

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
    // ALL stack-compatible catalog entries (mesh + integration + blank) — the
    // reserved-id domain needs every catalog id (a blank-instance name slugging
    // to one would clone the wrong repo via the executor's catalog-first lookup).
    const availableEntries = useMemo<AppBuilderComponentCatalogEntry[]>(
        () => getAvailableAppBuilderComponents(stack?.backend ?? '', stack?.frontend ?? ''),
        [stack],
    );
    // Integration-kind entries, split: the FINISHED catalog (the "Pre-built
    // integration" gallery) vs. the blank starter app (the "Build custom"
    // card) — the blank is NOT a pre-built integration and never shows in the gallery.
    const integrationEntries = useMemo<AppBuilderComponentCatalogEntry[]>(
        () => availableEntries.filter((entry) => entry.kind === 'integration'),
        [availableEntries],
    );
    const catalog = useMemo(
        () => integrationEntries.filter((entry) => !entry.blank),
        [integrationEntries],
    );
    const blankComponent = useMemo(
        () => integrationEntries.find((entry) => entry.blank),
        [integrationEntries],
    );

    // The blank-naming collision domain: current selections + custom sources +
    // every stack-compatible catalog id (incl. blank + mesh) + selected addons +
    // optional deps. Component ids and the '__existing__' key are baked into
    // buildReservedIds itself.
    const reservedIds = useMemo(
        () =>
            buildReservedIds({
                selectedIntegrationIds: state.selectedAppBuilderComponents ?? EMPTY_PICKS,
                sourceIds: Object.keys(state.appBuilderComponentSources ?? {}),
                catalogIds: [
                    ...availableEntries.map((entry) => entry.id),
                    ...(meshComponent ? [meshComponent.id] : []),
                ],
                selectedAddons: state.selectedAddons ?? EMPTY_PICKS,
                selectedOptionalDependencies: state.selectedOptionalDependencies ?? EMPTY_PICKS,
            }),
        [
            state.selectedAppBuilderComponents,
            state.appBuilderComponentSources,
            state.selectedAddons,
            state.selectedOptionalDependencies,
            availableEntries,
            meshComponent,
        ],
    );

    // Resolve rows against the FULL entry list (incl. the blank starter) so a
    // committed "Build custom" app gets a row — `catalog` (blank-filtered) is only
    // the modal's gallery, not the source of truth for configured integrations.
    const rows = useMemo(
        () => resolveIntegrationRows(state, meshComponent, integrationEntries),
        [state, meshComponent, integrationEntries],
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

    // The row being renamed (AI-built instance rows only). The rename modal is
    // display-name only: commit updates sources[id].name in place — id, picks,
    // and selection are immutable.
    const [renameTarget, setRenameTarget] = useState<BlankInstance | null>(null);
    const closeRename = useCallback((): void => setRenameTarget(null), []);
    const commitRename = useCallback(
        (name: string): void => {
            if (renameTarget) onRenameAppBuilderComponent(renameTarget.id, name);
            setRenameTarget(null);
        },
        [renameTarget, onRenameAppBuilderComponent],
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
                            onChangeApis={() => openEditApis(row)}
                            onRename={
                                row.renamable
                                    ? () => setRenameTarget({ id: row.id, name: row.name })
                                    : undefined
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
                editTarget={mode === 'api-edit' ? editTarget : undefined}
                state={state}
                updateState={updateState}
                meshComponent={meshComponent}
                catalog={catalog}
                blankComponent={blankComponent}
                reservedIds={reservedIds}
                builder={builder}
            />
            <RenameIntegrationModal
                isOpen={renameTarget !== null}
                currentName={renameTarget?.name ?? ''}
                // Every OTHER row's display name is taken (mesh/catalog names included).
                takenNames={rows
                    .filter((row) => row.id !== renameTarget?.id)
                    .map((row) => row.name)}
                onClose={closeRename}
                onRename={commitRename}
            />
        </div>
    );
}
