/**
 * IntegrationCard — one deployable in the Integrations "Services" screen.
 *
 * A selection-aware, expandable card. Selection uses the Commerce choice-card language
 * (blue border + tint + a ✓ badge via `data-selected` / `.int-card-check`) rather than
 * an On/Off pill; the Add/Remove button is the control. When `selected`, the card
 * expands to host its config (`children`) — the destination sign-in + project/workspace.
 * An N/A card (no applicable deployable for the stack) shows a muted `naLabel` and no
 * action. Presentational only — the parent owns selection state + handlers.
 *
 * @module features/project-creation/ui/components/IntegrationCard
 */

import { ActionButton, Button } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useState } from 'react';
import { SelectionCheck } from './SelectionCheck';

/** A deployable card's single action button (Add / Remove). */
export interface IntegrationCardAction {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'accent';
}

export interface IntegrationCardProps {
    /** Deployable name (e.g. "API Mesh"). */
    name: string;
    /** One-line description. */
    description: string;
    /** Whether this deployable is selected (drives the blue-check styling + expansion). */
    selected: boolean;
    /** When set, the deployable is N/A for the stack: shows this muted label, no action. */
    naLabel?: string;
    /** Optional action button (Add / Remove); omitted for an N/A card. */
    action?: IntegrationCardAction;
    /**
     * Optional quiet, link-style header action rendered before {@link action} (e.g.
     * "Change"). Shown only for a non-N/A card — a secondary way out of the card's flow.
     */
    secondaryAction?: { label: string; onPress: () => void };
    /**
     * When true, a disclosure chevron lets the user collapse the configured card to
     * its {@link summary}. Set by the parent once the integration is fully configured.
     */
    collapsible?: boolean;
    /** One-line summary shown (in place of the description) while collapsed. */
    summary?: React.ReactNode;
    /** Config revealed inline when the card is selected (e.g. the destination fields). */
    children?: React.ReactNode;
}

/**
 * A single deployable card (selection-aware + expandable).
 *
 * @param props - name, description, selection, optional N/A label / action / children
 * @returns the card element
 */
export function IntegrationCard({
    name,
    description,
    selected,
    naLabel,
    action,
    secondaryAction,
    collapsible = false,
    summary,
    children,
}: IntegrationCardProps): React.ReactElement {
    const [collapsed, setCollapsed] = useState(false);
    const isNa = naLabel !== undefined;
    // Only a configured (collapsible) card may collapse; if it stops being
    // collapsible (e.g. the user hit Change), it force-expands.
    const canCollapse = collapsible && !isNa;
    const isCollapsed = canCollapse && collapsed;
    const showConfig = selected && !isNa && Boolean(children) && !isCollapsed;
    return (
        <div className="int-card" data-selected={selected ? 'true' : undefined}>
            <div className="int-card-head">
                {selected && <SelectionCheck />}
                <div className="int-card-headings">
                    <div className="int-card-name">{name}</div>
                    {isCollapsed && summary !== undefined ? (
                        <div className="int-card-summary">{summary}</div>
                    ) : (
                        <div className="int-card-desc">{description}</div>
                    )}
                </div>
                <div className="int-card-actions">
                    {isNa ? (
                        <span className="int-card-na">{naLabel}</span>
                    ) : (
                        <>
                            {secondaryAction && (
                                <button
                                    type="button"
                                    className="service-action-link"
                                    onClick={secondaryAction.onPress}
                                >
                                    {secondaryAction.label}
                                </button>
                            )}
                            {action && (
                                <Button
                                    variant={action.variant ?? 'secondary'}
                                    onPress={action.onPress}
                                >
                                    {action.label}
                                </Button>
                            )}
                            {canCollapse && (
                                <ActionButton
                                    isQuiet
                                    aria-label={isCollapsed ? `Expand ${name}` : `Collapse ${name}`}
                                    onPress={() => setCollapsed((c) => !c)}
                                >
                                    {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                                </ActionButton>
                            )}
                        </>
                    )}
                </div>
            </div>
            {showConfig && <div className="int-card-config">{children}</div>}
        </div>
    );
}
