/**
 * AppBuilderIntegrationCard — an added App Builder integration on the Integrations
 * "Services" screen.
 *
 * A simpler sibling of {@link MeshIntegrationCard}. Wraps the presentational
 * {@link IntegrationCard} as a COMPACT reference to the ONE shared Adobe I/O project +
 * workspace (`state.adobeProject` / `state.adobeWorkspace`), which {@link AdobeIoStep}
 * establishes in the Integrations "Adobe I/O" sub-step. The card never signs in or picks a
 * workspace — it only references it:
 *   - the source (owner/repo) reads in the card DESCRIPTION, so it is not repeated in the body;
 *   - shows the "Deploys to" reference row ONLY once the shared destination is configured
 *     (nothing in the body before that).
 *
 * No phase flow and no API-enable row — an integration's required APIs are subscribed by
 * the creation-time deploy runner. Add/Remove is owned here via the `onRemove` callback.
 *
 * @module features/project-creation/ui/components/AppBuilderIntegrationCard
 */

import React from 'react';
import { isAdobeSignedIn } from '../steps/tileStatus';
import type { SelectedIntegration } from './appBuilderIntegrationList';
import { IntegrationCard } from './IntegrationCard';
import type { WizardState } from '@/types/webview';

export interface AppBuilderIntegrationCardProps {
    integration: SelectedIntegration;
    state: WizardState;
    /** Remove this integration (clears its selection + source). */
    onRemove: (id: string) => void;
    /** Swap this integration out: remove it and reopen the Add flow on its catalog step. */
    onChange: (id: string) => void;
}

/** A read-only reference row (the mesh ChosenRow minus the "Change" button). */
function ReferenceRow({ label, value }: { label: string; value: string }): React.ReactElement {
    return (
        <div className="int-chosen">
            <span className="int-chosen-check" aria-hidden="true">
                ✓
            </span>
            <span className="int-chosen-label">{label}</span>
            <span className="int-chosen-value">{value}</span>
        </div>
    );
}

/** Props for the compact integration card body (the committed-destination reference). */
interface IntegrationBodyProps {
    projectName: string;
    workspaceName: string;
}

/**
 * The compact card body: always the "Source" reference row, plus the "Deploys to" row
 * once the shared destination is configured. The card never establishes the destination.
 *
 * @param props - the integration, the configured flag, and the committed names
 * @returns the body block
 */
function IntegrationBody({
    projectName,
    workspaceName,
}: IntegrationBodyProps): React.ReactElement {
    // The source (owner/repo) already reads in the card description, so it is not
    // repeated here — only the committed destination is shown.
    return (
        <div className="int-destination">
            <ReferenceRow label="Deploys to" value={`${projectName} · ${workspaceName}`} />
        </div>
    );
}

/**
 * The added-integration card with its shared-destination reference.
 *
 * @param props - the integration descriptor, state, and the Remove/Change callbacks
 * @returns the integration card
 */
export function AppBuilderIntegrationCard({
    integration,
    state,
    onRemove,
    onChange,
}: AppBuilderIntegrationCardProps): React.ReactElement {
    const signedIn = isAdobeSignedIn(state);
    const projectId = state.adobeProject?.id;
    const workspaceId = state.adobeWorkspace?.id;
    const projectName = state.adobeProject?.title || state.adobeProject?.name || '';
    const workspaceName = state.adobeWorkspace?.title || state.adobeWorkspace?.name || '';
    const configured = signedIn && Boolean(projectId) && Boolean(workspaceId);
    // "Change" reopens the catalog, so it only applies to catalog integrations. A custom
    // integration is defined by its GitHub URL — to change it, remove and re-add it.
    const isCustom = Boolean(state.appBuilderComponentSources?.[integration.id]);

    return (
        <IntegrationCard
            name={integration.name}
            description={`App Builder app · ${integration.owner}/${integration.repo}`}
            selected
            action={{
                label: 'Remove',
                onPress: () => onRemove(integration.id),
                variant: 'secondary',
            }}
            secondaryAction={
                isCustom ? undefined : { label: 'Change', onPress: () => onChange(integration.id) }
            }
            collapsible={configured}
            summary={configured ? `${integration.owner}/${integration.repo} · ${workspaceName}` : undefined}
        >
            {configured ? (
                <IntegrationBody projectName={projectName} workspaceName={workspaceName} />
            ) : undefined}
        </IntegrationCard>
    );
}
