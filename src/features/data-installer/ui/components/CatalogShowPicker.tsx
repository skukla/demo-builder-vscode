/**
 * The Show list, on the Datapacks screen and the wizard's Datapacks step: which packs the catalog
 * draws. Its word is plain text rather than Spectrum's side label, which is smaller than the choice
 * beside it (owner, 2026-11-05). The list carries the name for a screen reader.
 *
 * @module features/data-installer/ui/components/CatalogShowPicker
 */

import { Item, Picker } from '@adobe/react-spectrum';
import React from 'react';
import { showOptions, type CatalogShow } from '../catalogShow';

export interface CatalogShowPickerProps {
    show: CatalogShow;
    onShow: (show: CatalogShow) => void;
    /** Whether the Data Installer answered: an SC it has not has no such packs to choose. */
    installerAnswered: boolean;
}

/**
 * The word and the list.
 *
 * @param props - the choice, its setter and whether the Data Installer answered
 * @returns the control
 */
export function CatalogShowPicker({ show, onShow, installerAnswered }: CatalogShowPickerProps): React.JSX.Element {
    return (
        <div className="datapack-show">
            <span aria-hidden="true">Show</span>
            <Picker aria-label="Show" selectedKey={show} onSelectionChange={(key) => onShow(key as CatalogShow)}>
                {showOptions(installerAnswered).map((option) => (
                    <Item key={option.key}>{option.label}</Item>
                ))}
            </Picker>
        </div>
    );
}
