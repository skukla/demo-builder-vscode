/**
 * What sits after the count on the datapack catalog's header: the Show list, then the catalog's
 * actions (`CatalogHeaderActions`). The list (`CatalogShowPicker`, owner, 2026-11-05) replaced the
 * Community and Data Installer switches.
 *
 * @module features/data-installer/ui/components/CatalogCountRow
 */

import { Flex } from '@adobe/react-spectrum';
import React from 'react';
import { CatalogHeaderActions, type CatalogHeaderActionsProps } from './CatalogHeaderActions';
import { CatalogShowPicker, type CatalogShowPickerProps } from './CatalogShowPicker';

export interface CatalogCountRowProps extends CatalogHeaderActionsProps, CatalogShowPickerProps {}

/**
 * The Show list and the actions, in one row.
 *
 * @param props - the list and the actions' own props
 * @returns the row
 */
export function CatalogCountRow({ show, onShow, installerAnswered, ...actions }: CatalogCountRowProps): React.JSX.Element {
    return (
        <Flex gap="size-200" alignItems="center">
            <CatalogShowPicker show={show} onShow={onShow} installerAnswered={installerAnswered} />
            {/* Create datapack, Load from file, then Clear demo data set apart. */}
            <CatalogHeaderActions {...actions} />
        </Flex>
    );
}
