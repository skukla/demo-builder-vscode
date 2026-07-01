/**
 * MeshIntegrationCard — the stateful API Mesh card for the Integrations "Services" screen.
 *
 * Wraps the presentational {@link IntegrationCard} and, when the mesh is added, expands
 * to host its Adobe I/O destination INLINE (dissolving the former separate Sign in /
 * Destination sub-steps):
 *   - signed OUT → an inline sign-in gate (the reused {@link AdobeAuthStep}); once signed
 *     in it swaps to the destination fields.
 *   - signed IN → the project then (once a project is chosen) the workspace field — each
 *     the reused select-or-create control ({@link AdobeProjectField}/{@link AdobeWorkspaceField})
 *     — with commit-and-collapse: only one field is open at a time, and a chosen field
 *     collapses to a compact {@link ChosenRow} with a quiet "Change". Mirrors the Commerce
 *     accordion done-state; keeps the card short.
 *
 * Availability + the Add/Remove toggle are owned by the parent (IntegrationsStep); this
 * component owns only the inline expansion + the collapse orchestration.
 *
 * @module features/project-creation/ui/components/MeshIntegrationCard
 */

import { Button } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { isAdobeSignedIn } from '../steps/tileStatus';
import { IntegrationCard, type IntegrationCardAction } from './IntegrationCard';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { WizardState } from '@/types/webview';

/** No-op setter for the inline AdobeAuthStep (the footer/driver owns the real gate). */
const NOOP = (): void => {};

const MESH_NAME = 'API Mesh';
/** The static mesh description (matches the v6 prototype). */
export const MESH_DESCRIPTION =
    'GraphQL bridge between storefront and backend. Deploys to Adobe I/O; provides MESH_ENDPOINT.';

/** Which destination field the user has explicitly reopened for editing. */
type DestinationField = 'project' | 'workspace';

export interface MeshIntegrationCardProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /** Whether a mesh component applies to the current package + stack. */
    available: boolean;
    /** Whether the mesh is currently selected. */
    selected: boolean;
    /** Add (true) / Remove (false) the mesh. */
    onToggle: (next: boolean) => void;
}

/** A committed destination choice, collapsed to one compact line with a quiet "Change". */
function ChosenRow({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: () => void;
}): React.ReactElement {
    return (
        <div className="int-chosen">
            <span className="int-chosen-check" aria-hidden="true">
                ✓
            </span>
            <span className="int-chosen-label">{label}</span>
            <span className="int-chosen-value">{value}</span>
            <Button variant="secondary" isQuiet onPress={onChange}>
                Change
            </Button>
        </div>
    );
}

/**
 * The API Mesh card with its inline destination.
 *
 * @param props - state, updater, availability, selection, and the Add/Remove toggle
 * @returns the mesh card
 */
export function MeshIntegrationCard({
    state,
    updateState,
    available,
    selected,
    onToggle,
}: MeshIntegrationCardProps): React.ReactElement {
    const signedIn = isAdobeSignedIn(state);
    const projectId = state.adobeProject?.id;
    const workspaceId = state.adobeWorkspace?.id;
    const projectName = state.adobeProject?.title || state.adobeProject?.name || '';
    const workspaceName = state.adobeWorkspace?.title || state.adobeWorkspace?.name || '';

    // Which field the user reopened via "Change". A field auto-collapses once its value
    // changes (a selection/creation committed), so only one field is open at a time.
    const [editing, setEditing] = useState<DestinationField | null>(null);
    useEffect(() => {
        setEditing(e => (e === 'project' ? null : e));
    }, [projectId]);
    useEffect(() => {
        setEditing(e => (e === 'workspace' ? null : e));
    }, [workspaceId]);

    let action: IntegrationCardAction | undefined;
    if (available) {
        action = {
            label: selected ? 'Remove' : 'Add',
            onPress: () => onToggle(!selected),
            variant: selected ? 'secondary' : 'accent',
        };
    }

    let config: React.ReactNode = null;
    if (selected && available) {
        if (!signedIn) {
            // Inline sign-in gate — reuses the full auth step (like Commerce's signin).
            config = <AdobeAuthStep state={state} updateState={updateState} setCanProceed={NOOP} />;
        } else {
            const projectOpen = !projectId || editing === 'project';
            const workspaceOpen = Boolean(projectId) && (!workspaceId || editing === 'workspace');
            config = (
                <div className="int-destination">
                    {projectOpen ? (
                        <AdobeProjectField state={state} updateState={updateState} />
                    ) : (
                        <ChosenRow
                            label="Project"
                            value={projectName}
                            onChange={() => setEditing('project')}
                        />
                    )}
                    {projectId &&
                        (workspaceOpen ? (
                            <AdobeWorkspaceField state={state} updateState={updateState} />
                        ) : (
                            <ChosenRow
                                label="Workspace"
                                value={workspaceName}
                                onChange={() => setEditing('workspace')}
                            />
                        ))}
                </div>
            );
        }
    }

    return (
        <IntegrationCard
            name={MESH_NAME}
            description={MESH_DESCRIPTION}
            selected={selected}
            naLabel={available ? undefined : 'N/A for this architecture'}
            action={action}
        >
            {config}
        </IntegrationCard>
    );
}
