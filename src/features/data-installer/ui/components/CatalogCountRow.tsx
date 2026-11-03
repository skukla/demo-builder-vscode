/**
 * What sits after the count on the datapack catalog's header: the two list switches, then the
 * catalog's actions (`CatalogHeaderActions`). Split out of `DatapackCatalogView` when the Data
 * Installer switch joined Community (owner, 2026-11-03), which took that view past its import limit.
 *
 * The Data Installer switch shows only once the Data Installer has answered this SC: one with no
 * address, or one it turns away, has nothing to switch (owner, same day).
 *
 * @module features/data-installer/ui/components/CatalogCountRow
 */

import { Flex, Switch } from '@adobe/react-spectrum';
import React from 'react';
import { CatalogHeaderActions, type CatalogHeaderActionsProps } from './CatalogHeaderActions';

export interface CatalogCountRowProps extends CatalogHeaderActionsProps {
    includeCommunity: boolean;
    onIncludeCommunity: (on: boolean) => void;
    /** The Data Installer switch, or undefined while it has not answered this SC. */
    installer?: { on: boolean; onChange: (on: boolean) => void };
}

/**
 * The switches and the actions, in one row.
 *
 * @param props - the two switches and the actions' own props
 * @returns the row
 */
export function CatalogCountRow({
    includeCommunity,
    onIncludeCommunity,
    installer,
    ...actions
}: CatalogCountRowProps): React.JSX.Element {
    return (
        <Flex gap="size-200" alignItems="center">
            <Switch isSelected={includeCommunity} onChange={onIncludeCommunity}>
                Include Community Datapacks
            </Switch>
            {installer ? (
                <Switch isSelected={installer.on} onChange={installer.onChange}>
                    Include Data Installer Datapacks
                </Switch>
            ) : null}
            {/* Create datapack, Load from file, then Clear demo data set apart. */}
            <CatalogHeaderActions {...actions} />
        </Flex>
    );
}
