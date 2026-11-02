/**
 * A Commerce pack's data types with the service's engine, as cards each turning on and off, or why
 * there are none: an empty screen with no reason is the silence this feature spent a day diagnosing
 * in the service itself.
 *
 * @module features/data-installer/ui/components/create-flow/stages/ServiceTypesStage
 */

import React, { useMemo } from 'react';
import { SelectAllToggle } from '../../SelectAllToggle';
import type { TypeChoices } from '../useExportAnswers';
import { ToggleCards, typeCardOptions } from './ToggleCards';

export function ServiceTypesStage({ types }: { types: TypeChoices }): React.ReactElement {
    const options = useMemo(() => typeCardOptions(types.available), [types.available]);
    if (types.error) {
        return <p className="dialog-problem text-negative">The exportable data types could not be loaded: {types.error}</p>;
    }
    return (
        <>
            <div className="datapack-import-types-head">
                <span className="datapack-import-label">Data types</span>
                {options.length > 0 ? <SelectAllToggle allSelected={types.allSelected} onToggle={types.onToggleAll} /> : null}
            </div>
            <ToggleCards dense options={options} picked={types.selected} onToggle={types.onToggle} />
        </>
    );
}
