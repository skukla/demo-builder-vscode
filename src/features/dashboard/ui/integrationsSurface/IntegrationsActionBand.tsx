/**
 * IntegrationsActionBand — the sticky band above the integrations grid.
 *
 * `SearchHeader` (count, filter, refresh, cards/rows toggle) with the deploy
 * destination on its count row, plus the trailing "Project Dashboard" button —
 * the way DashboardStatusHeader trails "All Projects" after its status badges.
 * Rendered as `FullScreenSurface`'s `header` by `IntegrationsScreen`, which owns
 * every value it shows. Moved out of the screen (EDS-8, 2026-10-08) with its
 * markup unchanged.
 *
 * Not a shared component: the destination row and the count wording are this
 * surface's own, and the projects list and datapack catalog compose
 * `SearchHeader` directly.
 *
 * @module features/dashboard/ui/integrationsSurface/IntegrationsActionBand
 */

import { Button, Flex, View } from '@adobe/react-spectrum';
import React from 'react';
import type { IntegrationCardModel } from '../components/integrations/integrationCardModel';
import type { IntegrationCardSearch } from './useIntegrationCardSearch';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { DestinationContext } from '@/core/ui/components/ui/DestinationContext';
import type { ViewMode } from '@/types/viewMode';
import type { DestinationTitles } from '@/types/webviewPayloads';

/**
 * The Adobe project an integration deploys to, or undefined when the project has
 * no Adobe target yet. Undefined hides the destination line rather than
 * rendering an empty one.
 *
 * No workspace (owner, 2026-09-21): since AB-23 each integration deploys into a
 * workspace of its own, so the project-wide one ("Stage") was wrong for every
 * integration, and naming each one's own would show plumbing the SC never picks.
 */
export function formatDestination(destination?: { projectTitle?: string }): string | undefined {
    return destination?.projectTitle || undefined;
}

/** "2 integrations", or "1 integration · 1 system" once a system is on screen. */
function countCards(cards: IntegrationCardModel[]): string {
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const systems = cards.filter((card) => card.isSystem).length;
    const integrations = cards.length - systems;
    // The mesh counts as an integration, as it always has on this screen.
    return systems === 0
        ? count(integrations, 'integration')
        : `${count(integrations, 'integration')} · ${count(systems, 'system')}`;
}

export interface IntegrationsActionBandProps {
    /** Every card on the screen, unfiltered — the count reads these. */
    cards: IntegrationCardModel[];
    /** The screen's filter: its query, and the cards it leaves visible. */
    search: IntegrationCardSearch;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onRefresh: () => void;
    /** The live deploy destination; no destination row without one. */
    destination: DestinationTitles | undefined;
    onChangeDestination: () => void;
    onBack: () => void;
}

export function IntegrationsActionBand({
    cards,
    search,
    viewMode,
    onViewModeChange,
    onRefresh,
    destination,
    onChangeDestination,
    onBack,
}: IntegrationsActionBandProps): React.ReactElement {
    const destinationLabel = formatDestination(destination);
    return (
        <Flex alignItems="start" gap="size-300">
            <View flex>
                <SearchHeader
                    searchQuery={search.searchQuery}
                    onSearchQueryChange={search.setSearchQuery}
                    searchPlaceholder="Filter integrations"
                    // 0, matching the projects list: show the field
                    // from the first item. Not a tuning knob — the
                    // COUNT's position depends on it. SearchHeader
                    // puts the count beside the refresh button when
                    // there is no field, and on its own line beneath
                    // the field when there is; a high threshold left
                    // this screen rendering the no-search fallback.
                    searchThreshold={0}
                    totalCount={cards.length}
                    filteredCount={search.visibleCards.length}
                    itemNoun="integration"
                    countText={countCards(cards)}
                    onRefresh={onRefresh}
                    refreshAriaLabel="Refresh integrations"
                    viewMode={viewMode}
                    onViewModeChange={onViewModeChange}
                    hasLoadedOnce
                    alwaysShowCount
                    // The count row is space-between and its right
                    // half is empty once a field shows. The deploy
                    // destination goes there rather than costing the
                    // band a row: it is the least-used fact on the
                    // screen. NOT the page header — that is where the
                    // LOCAL project name and the REMOTE Adobe
                    // destination were indistinguishable.
                    countTrailing={
                        destinationLabel ? (
                            <div
                                className="page-destination-row"
                                data-testid="page-destination"
                            >
                                <span className="page-destination-label">
                                    Deploys to
                                </span>
                                <DestinationContext
                                    project={destination?.projectTitle}
                                    projectOnly
                                    onChange={onChangeDestination}
                                />
                            </div>
                        ) : undefined
                    }
                />
            </View>
            {/* The trailing nav button mirrors DashboardStatusHeader. No
                Add button here: adding is the card at the end of the
                grid (PL-62), and the empty state carries its own CTA. */}
            <Button variant="secondary" onPress={onBack}>
                Project Dashboard
            </Button>
        </Flex>
    );
}
