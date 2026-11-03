/**
 * A Commerce pack's data types with the service's engine, each a checkbox, or why
 * there are none: an empty screen with no reason is the silence this feature spent a day diagnosing
 * in the service itself.
 *
 * @module features/data-installer/ui/components/create-flow/stages/ServiceTypesStage
 */

import React, { useMemo } from 'react';
import type { TypeChoices } from '../useExportAnswers';
import { CheckRows, typeOptions } from './CheckRows';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';

export function ServiceTypesStage({ types }: { types: TypeChoices }): React.ReactElement {
    const options = useMemo(() => typeOptions(types.available), [types.available]);
    if (types.error) {
        return <p className="dialog-problem text-negative">Couldn&apos;t load data types: {types.error}</p>;
    }
    return (
        <>
            <span className="datapack-import-label">Data Types</span>
            {options.length > 0 ? <SelectAllRow all={types.allSelected} some={types.selected.length > 0} onToggle={types.onToggleAll} /> : null}
            <CheckRows options={options} picked={types.selected} onToggle={types.onToggle} />
        </>
    );
}
