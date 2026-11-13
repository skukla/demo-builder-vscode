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

import { ActionButton, Badge, Item, Picker, Text, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { isSavedVersion, shownVersion, versionChanged } from '../../packVersions';
import type { DatapackGroup } from '../../services/datapackCatalog';
import type { DatapackArt, DatapackSummary } from '../../types';
import { packSource, type PackSource } from '../catalogShow';
import { SelectionCheck } from '@/core/ui/components/ui/SelectionCheck';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { cn } from '@/core/ui/utils/classNames';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

export interface DatapackCardProps {
    /** Every version of one datapack, already ordered by the catalog service. */
    group: DatapackGroup;
    /** Version currently on show; owned by the parent. */
    selectedVersion: string;
    /** Fires with the picked version. */
    onVersionChange: (version: string) => void;
    /** Card press → open the detail flyout for the SELECTED version, in its store. */
    onOpen: (id: DatapackId, store: DatapackStoreName) => void;
    /**
     * Present when this card is one of a set the user CHOOSES between; absent
     * when it merely opens (the catalog panel's use).
     *
     * The presence of the prop is the switch, not its value: `selected={false}`
     * still means "selectable, not selected", so the card becomes a radio there
     * too. The wizard's sample-data sub-step is the choosing caller.
     */
    selected?: boolean;
    /**
     * This pack is believed to be on the project's Commerce instance.
     *
     * "Believed", precisely: nothing available reports what Commerce actually
     * holds. It is the union of two self-reports — the service's instance-scoped
     * installed list and the project's own record — and both clear when a
     * removal runs through the extension, which is the case that matters.
     *
     * Distinct from {@link DatapackCardProps.selected}, which is radio semantics
     * for a set the user is choosing between. This is a STATUS the card reports
     * about itself, which is why a wizard card can carry both at once.
     *
     * It replaces a full-width banner above the grid ("<project> is set up for
     * <pack>" + a Review link) that said a card's own state somewhere the card
     * was not, and then needed a link to point back at it.
     */
    isInstalled?: boolean;
    /**
     * The amber dot's words, present only on the demo's own pack while Restore would install a save
     * newer than the one the project holds: "Newer save available" (J4-1, `restoreIsNewer`). The
     * house amber dot beside the date, the dashboard's "due" mark, says this on hover in Spectrum's
     * tooltip, as the dashboard's dots do (owner, 2026-11-07: a browser `title` never showed here).
     */
    newer?: string;
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
    isInstalled,
    newer,
}: DatapackCardProps): React.JSX.Element {
    // Checked for PRESENCE: `false` means selectable-and-unselected, which is
    // still a radio. Truthiness here would silently make every unselected card
    // in a choice grid announce itself as a button.
    const choosing = selected !== undefined;
    const version = selectVersion(group, selectedVersion);

    const handleOpen = useCallback(
        (): void => onOpen({ name: group.name, version: selectedVersion }, group.store),
        [onOpen, group.name, selectedVersion, group.store],
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
            aria-label={`${group.displayName}, ${shownVersion(selectedVersion)}`}
            // `is-selected` is the accent border, and the project's pack earns it
            // for the same reason a chosen card does: it is the one that matters
            // in this grid. The two never conflict — a wizard card that is both
            // wants one border, not two.
            className={cn('datapack-card', (selected || isInstalled) && 'is-selected')}
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
                    {/* The shared blue check, INLINE rather than `corner`. The
                        corner variant pins to the card's top-right, which on this
                        card is the artwork — a check over a photograph, at
                        whatever contrast that photo happens to give it. The
                        Integrations card renders it inline for the same kind of
                        reason (its corner holds a button).

                        The tags live on the version line (owner, 2026-11-05): beside a
                        name that wrapped, they moved with it. */}
                    {isInstalled ? <SelectionCheck testId="datapack-card-project-check" /> : null}
                </div>
                <div className="datapack-card-version-row">
                {/* Containment: the picker's press must not bubble to the card,
                    or choosing a version would also open the flyout — the
                    conflicting-nested-action problem the integrations grid hit.
                    A span rather than a handler on the Picker because the popup
                    and its options are the parts that escape. */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child Picker (InlineRenameField precedent) */}
                <span
                    className={newer ? 'datapack-card-version datapack-card-version--newer' : 'datapack-card-version'}
                    onClick={stopPropagation}
                    onKeyDown={stopPropagation}
                >
                    <VersionChoice group={group} selectedVersion={selectedVersion} onVersionChange={onVersionChange} />
                    {newer ? <NewerMark said={newer} /> : null}
                </span>
                {/* No count of data types (owner, 2026-11-05: the tile was crowded); the flyout
                    names them. */}
                <CardTags tags={cardTags(group)} />
                </div>
            </div>
        </div>
    );
}

/**
 * The versions to choose from: the named ones (`main`, `eds-compatible`), each a variant, and the
 * pack's saves as one, the save on show (owner, 2026-11-09, walk F99): a pack of saves is one thing,
 * and its earlier save is what Undo Last Save goes back to, not a version to pick. A pack of nothing but saves
 * has nothing to choose, so it says which save it is.
 */
function VersionChoice({ group, selectedVersion, onVersionChange }: Pick<DatapackCardProps, 'group' | 'selectedVersion' | 'onVersionChange'>): React.JSX.Element {
    const named = group.versions.filter((candidate) => !isSavedVersion(candidate.id.version));
    if (named.length === 0) return <span className="text-sm text-gray-700">{shownVersion(selectedVersion)}</span>;
    const save = isSavedVersion(selectedVersion) ? selectedVersion : group.versions.find((candidate) => isSavedVersion(candidate.id.version))?.id.version;
    const choices = save ? [...named.map((candidate) => candidate.id.version), save] : named.map((candidate) => candidate.id.version);
    const changed = (version: string): string | undefined => {
        const summary = group.versions.find((candidate) => candidate.id.version === version);
        return summary && !isSavedVersion(version) ? versionChanged(summary) : undefined;
    };
    return (
        <Picker aria-label={`Version of ${group.displayName}`} selectedKey={selectedVersion} onSelectionChange={(key) => onVersionChange(String(key))}>
            {choices.map((version) => (
                <Item key={version} textValue={shownVersion(version)}>
                    <Text>{shownVersion(version)}</Text>
                    {changed(version) ? <Text slot="description">{changed(version)}</Text> : null}
                </Item>
            ))}
        </Picker>
    );
}

/**
 * The amber dot beside the version, saying what is newer on hover and on focus. A quiet button,
 * because Spectrum's tooltip needs a focusable trigger; pressing it does nothing more.
 */
function NewerMark({ said }: { said: string }): React.JSX.Element {
    return (
        <TooltipTrigger delay={300}>
            <ActionButton isQuiet aria-label={said} UNSAFE_className="datapack-card-newer">
                <StatusDot variant="warning" />
            </ActionButton>
            <Tooltip>{said}</Tooltip>
        </TooltipTrigger>
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

/**
 * The words for where a pack comes from, one per source, each matching its Show choice. A team pack
 * said nothing until 2026-11-09 (owner, walk F86): beside Mine, Data Installer and Community it read
 * as unlabelled. It says Demo Builder, whose it is, as Mine and Community say (step-04 S6, J8-2,
 * owner 2026-11-12); the source's key stays `team`.
 */
const CARD_TAG: Record<PackSource, string> = {
    yours: 'Mine',
    team: 'Demo Builder',
    installer: 'Data Installer',
    community: 'Community',
};

/**
 * One word per fact (owner, 2026-11-05): where it comes from, then Community when everyone can see
 * it. The SC's own shared pack is both Mine and Community; "Shared" said the same as Community.
 */
export function cardTags(group: DatapackGroup): string[] {
    const source = packSource(group);
    const tags = [CARD_TAG[source]];
    if (source === 'yours' && group.shared) tags.push('Community');
    return tags;
}

/**
 * Spectrum's grey badges, as the integration card's type label ("ERP") and a setup step's
 * "Optional" draw theirs (owner, 2026-10-31). Grey, not blue: blue on these cards means selected.
 */
function CardTags({ tags }: { tags: string[] }): React.JSX.Element | null {
    if (tags.length === 0) return null;
    return (
        <span className="datapack-card-tags">
            {tags.map((tag) => (
                <Badge key={tag} variant="neutral" UNSAFE_className="datapack-card-tag">
                    {tag}
                </Badge>
            ))}
        </span>
    );
}

/** Keep a nested control's events inside the control. */
function stopPropagation(event: React.SyntheticEvent): void {
    event.stopPropagation();
}
