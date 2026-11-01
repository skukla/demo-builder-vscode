/**
 * Choose the ACO catalog view by name (PL-60). Choosing one also sets the locale it reads, so an SC who
 * can pick from a list answers one question where a typed id took two.
 *
 * @module features/dashboard/ui/configure/components/AcoCatalogViewPicker
 */

import { Item, Picker } from '@adobe/react-spectrum';
import React from 'react';
import type { AcoCatalogViewChoice } from '@/types/aco';

export interface AcoCatalogViewPickerProps {
    views: AcoCatalogViewChoice[];
    /** The view id the project holds. */
    selected: string;
    onSelect: (view: AcoCatalogViewChoice) => void;
}

export function AcoCatalogViewPicker({ views, selected, onSelect }: AcoCatalogViewPickerProps): React.ReactElement {
    return (
        <div id="field-ACO_CATALOG_VIEW_ID" className="config-field">
            <Picker
                label="Catalog View"
                selectedKey={selected}
                width="100%"
                isRequired
                marginBottom="size-200"
                items={views}
                onSelectionChange={(key) => {
                    const view = views.find((candidate) => candidate.id === String(key));
                    if (view) onSelect(view);
                }}
            >
                {(view) => <Item key={view.id}>{view.name}</Item>}
            </Picker>
        </div>
    );
}
