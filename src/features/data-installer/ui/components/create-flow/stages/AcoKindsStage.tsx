/**
 * An ACO pack's data types as cards, each turning on and off (`useAcoExportChoice`). Every one starts
 * on, and all of them on is sent as "every one".
 *
 * @module features/data-installer/ui/components/create-flow/stages/AcoKindsStage
 */

import React, { useMemo } from 'react';
import type { AcoExportChoice } from '../../../hooks/useAcoExportChoice';
import { ToggleCards, typeCardOptions } from './ToggleCards';

export function AcoKindsStage({ aco }: { aco: AcoExportChoice }): React.ReactElement {
    const options = useMemo(() => typeCardOptions(aco.kinds), [aco.kinds]);
    return (
        <>
            <span className="datapack-import-label">ACO data types</span>
            <ToggleCards options={options} picked={aco.pickedKinds} onToggle={aco.toggleKind} />
        </>
    );
}
