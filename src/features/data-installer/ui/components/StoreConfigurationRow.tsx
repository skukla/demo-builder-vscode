/**
 * The datapack flyout's Store Configuration row.
 *
 * @module features/data-installer/ui/components/StoreConfigurationRow
 */

import { ActionButton } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { configurationSettingsCount, STORE_CONFIGURATION } from '../../datapackWords';
import type { PackDetailLayer } from '../../types';
import { PanelRow } from '@/core/ui/components/ui/PanelRow';

/** The datapack's Store Configuration: how many settings, with their paths behind Show (Clarity 1.8: no layer id on screen). */
export function StoreConfigurationRow({ layer }: { layer: PackDetailLayer }): React.JSX.Element {
    const [shown, setShown] = useState(false);
    const count = layer.settings.length;
    return (
        <PanelRow label={STORE_CONFIGURATION}>
            <span>{configurationSettingsCount(count)}</span>
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
