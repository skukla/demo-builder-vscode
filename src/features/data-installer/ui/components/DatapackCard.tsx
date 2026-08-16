/**
 * DatapackCard — one datapack in the catalog grid.
 *
 * Feature-local by intent, per `reuse-first`. What was considered and rejected:
 *
 *   - `project-creation/ui/components/ChoiceCard` — the wizard's card primitive is
 *     a `<button>`, and this card must host a version `Picker`. A control inside a
 *     button is invalid HTML and unreachable by keyboard, so the primitive cannot
 *     be extended to cover this.
 *   - `feedback/StatusCard` — an ambient dot/label/value badge, not a tile.
 *
 * Nothing else in the repo renders an image, which is the genuinely new part. The
 * art chain is **cover → thumbnail → a CSS letter tile**, and live data uses all
 * three: 8 of the 23 curated entries carry a cover, all 23 carry a thumbnail, and
 * the community entries (the `aco_*` family) carry neither.
 *
 * Art belongs to a VERSION, not to the pack — `bodea/main` has a cover while
 * `bodea/tierpricingfix` has only a thumbnail — so changing the version changes
 * the art, and the fallback position resets with it (see {@link CardArt}'s `key`).
 *
 * Presentational and fully controlled: the parent owns the selected version, since
 * the detail drawer needs the same answer. It promotes to `core/ui` when the wizard
 * area (Stage 4) becomes its second consumer, not before.
 *
 * @module features/data-installer/ui/components/DatapackCard
 */

import { Item, Picker } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import type { DatapackGroup } from '../../services/datapackCatalog';
import type { DatapackArt, DatapackId, DatapackSummary } from '../../types';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';

export interface DatapackCardProps {
    /** Every version of one datapack, already ordered by the catalog service. */
    group: DatapackGroup;
    /** Version currently on show; owned by the parent. */
    selectedVersion: string;
    /** Fires with the picked version. */
    onVersionChange: (version: string) => void;
    /** Card press → open the detail flyout for the SELECTED version. */
    onOpen: (id: DatapackId) => void;
    /**
     * Present when this card is one of a set the user CHOOSES between; absent
     * when it merely opens (the catalog panel's use).
     *
     * The presence of the prop is the switch, not its value: `selected={false}`
     * still means "selectable, not selected", so the card becomes a radio there
     * too. The wizard's sample-data sub-step is the choosing caller.
     */
    selected?: boolean;
}

/**
 * The webview CSP resolves `img-src` to `[cspSource, https:, data:]`
 * (`core/utils/getWebviewHTMLWithBundles.ts`). Anything else is blocked before the
 * request, so it is dropped here rather than rendered as an image that can only
 * correct itself by failing.
 */
const LOADABLE_ART = /^(https:|data:)/i;

export function DatapackCard({
    group,
    selectedVersion,
    onVersionChange,
    onOpen,
    selected,
}: DatapackCardProps): React.JSX.Element {
    // Checked for PRESENCE: `false` means selectable-and-unselected, which is
    // still a radio. Truthiness here would silently make every unselected card
    // in a choice grid announce itself as a button.
    const choosing = selected !== undefined;
    const version = selectVersion(group, selectedVersion);
    const typeCount = version?.dataTypes.length ?? 0;

    const handleOpen = useCallback(
        (): void => onOpen({ name: group.name, version: selectedVersion }),
        [onOpen, group.name, selectedVersion],
    );
    const handleKeyDown = useActivateOnKey(handleOpen);

    return (
        // A div-role button, not a <button>: this card hosts the version Picker,
        // and a control nested in a button is invalid HTML and unreachable by
        // keyboard. Same treatment as IntegrationCard and ProjectCard.
        //
        // The disable is for the DYNAMIC role only. The rule reads the JSX
        // statically, so a computed `role` reads to it as no role at all — while
        // this element carries a role, a tab stop, a click handler and the
        // Enter/Space contract in every branch. Both values are interactive
        // roles; neither leaves the element unreachable.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- role is computed (radio when choosing, button when browsing); both are interactive and keyboard-complete
        <div
            role={choosing ? 'radio' : 'button'}
            {...(choosing ? { 'aria-checked': selected } : {})}
            tabIndex={0}
            aria-label={`${group.displayName}, version ${selectedVersion}`}
            className={`datapack-card${selected ? ' is-selected' : ''}`}
            data-testid="datapack-card"
            data-datapack={group.name}
            onClick={handleOpen}
            onKeyDown={handleKeyDown}
        >
            <CardArt
                key={selectedVersion}
                candidates={artCandidates(version?.art)}
                letter={initial(group.displayName)}
            />
            <div className="datapack-card-body">
                <div className="datapack-card-title-row">
                    <span className="datapack-card-name">{group.displayName}</span>
                    {group.shared ? null : <span className="datapack-card-tag">Community</span>}
                </div>
                {/* Containment: the picker's press must not bubble to the card,
                    or choosing a version would also open the flyout — the
                    conflicting-nested-action problem the integrations grid hit.
                    A span rather than a handler on the Picker because the popup
                    and its options are the parts that escape. */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child Picker (InlineRenameField precedent) */}
                <span
                    className="datapack-card-version"
                    onClick={stopPropagation}
                    onKeyDown={stopPropagation}
                >
                    <Picker
                        aria-label={`Version of ${group.displayName}`}
                        selectedKey={selectedVersion}
                        onSelectionChange={(key) => onVersionChange(String(key))}
                    >
                        {group.versions.map((candidate) => (
                            <Item key={candidate.id.version}>{candidate.id.version}</Item>
                        ))}
                    </Picker>
                </span>
                <span className="datapack-card-types">
                    {typeCount} {typeCount === 1 ? 'data type' : 'data types'}
                </span>
            </div>
        </div>
    );
}

/**
 * The art, walking the candidate chain on load failure.
 *
 * Its own component so the fallback position is state React can reset: the parent
 * keys it by version, so picking a different version starts the chain over instead
 * of inheriting the previous version's failures.
 */
function CardArt({
    candidates,
    letter,
}: {
    candidates: string[];
    letter: string;
}): React.JSX.Element {
    const [index, setIndex] = useState(0);
    const src = candidates[index];

    if (!src) {
        return (
            <div className="datapack-card-art">
                <span className="datapack-card-tile" data-testid="datapack-card-tile">
                    {letter}
                </span>
            </div>
        );
    }

    return (
        <div className="datapack-card-art">
            {/* Decorative: the pack name sits beside it as real text. */}
            <img
                className="datapack-card-image"
                data-testid="datapack-card-art"
                src={src}
                alt=""
                onError={() => setIndex((current) => current + 1)}
            />
        </div>
    );
}

/** The version to render, tolerating a selection the group no longer carries. */
function selectVersion(group: DatapackGroup, version: string): DatapackSummary | undefined {
    return group.versions.find((candidate) => candidate.id.version === version) ?? group.versions[0];
}

/** Art to try, best first, dropping anything the CSP would block. */
function artCandidates(art: DatapackArt | undefined): string[] {
    return [art?.cover, art?.thumbnail]
        .map((url) => url?.trim() ?? '')
        .filter((url) => LOADABLE_ART.test(url));
}

/** The letter tile's glyph. */
function initial(displayName: string): string {
    return displayName.trim().charAt(0).toUpperCase() || '?';
}

/** Keep a nested control's events inside the control. */
function stopPropagation(event: React.SyntheticEvent): void {
    event.stopPropagation();
}
