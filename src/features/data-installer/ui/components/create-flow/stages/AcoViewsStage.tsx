/**
 * An ACO pack's store views as cards, each turning on and off (`useAcoExportChoice`), or why there
 * are none to choose. Every one starts on, and all of them on is sent as "every one".
 *
 * @module features/data-installer/ui/components/create-flow/stages/AcoViewsStage
 */

import React, { useMemo } from 'react';
import type { AcoExportChoice } from '../../../hooks/useAcoExportChoice';
import { ToggleCards } from './ToggleCards';

export function AcoViewsStage({ aco }: { aco: AcoExportChoice }): React.ReactElement {
    const options = useMemo(
        () => aco.storeViews.map((view) => ({ id: view.code, name: view.name, description: view.websiteName })),
        [aco.storeViews],
    );
    return (
        <>
            <span className="datapack-import-label">Store views</span>
            {options.length === 0 ? (
                <p className="dialog-problem text-notice">Couldn&apos;t load store views. The datapack will include all of them.</p>
            ) : (
                <ToggleCards options={options} picked={aco.pickedViews} onToggle={aco.toggleView} />
            )}
        </>
    );
}
