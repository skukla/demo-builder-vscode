/**
 * The datapack flyout's Store Settings row.
 *
 * @module features/data-installer/ui/components/StoreSettingsRow
 */

import { ActionButton } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { STORE_SETTINGS } from '../../datapackWords';
import type { PackDetailLayer } from '../../types';
import { PanelRow } from '@/core/ui/components/ui/PanelRow';

/** The datapack's Store Settings: how many, with their paths behind Show (Clarity 1.8: no layer id on screen). */
export function StoreSettingsRow({ layer }: { layer: PackDetailLayer }): React.JSX.Element {
    const [shown, setShown] = useState(false);
    const count = layer.settings.length;
    return (
        <PanelRow label={STORE_SETTINGS}>
            <span>{count === 1 ? '1 setting' : `${count} settings`}</span>
            <ActionButton isQuiet onPress={() => setShown(!shown)}>
                {shown ? 'Hide' : 'Show'}
            </ActionButton>
            {shown ? (
                <span className="datapack-panel-types" data-testid="datapack-detail-settings">
                    {layer.settings.map((setting) => (
                        <span key={setting.path} className="datapack-panel-type">
                            {setting.path}: {setting.value}
                        </span>
                    ))}
                </span>
            ) : null}
        </PanelRow>
    );
}
