/**
 * The grid's Settings state (AB-21): which components have settings, the cards
 * with the Settings item added, and the one open modal.
 *
 * Seeded from the init payload; a save answers with the settings as the
 * extension now holds them, which replace the seed for that component.
 *
 * @module features/dashboard/ui/components/integrations/useIntegrationSettings
 */

import { useCallback, useMemo, useState } from 'react';
import { withComponentSettings } from './integrationSettings';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
import type { ComponentSettings } from '@/types/appBuilderComponents';

type SettingsTarget = { id: string; name: string; settings: ComponentSettings };

export interface IntegrationSettingsState {
    /** The cards, with Settings on those that have any. */
    cards: IntegrationCardModel[];
    /** Open the modal for a card; does nothing for one without settings. */
    open: (model: IntegrationCardModel) => void;
    target: SettingsTarget | null;
    close: () => void;
    saved: (id: string, settings: ComponentSettings) => void;
}

export function useIntegrationSettings(
    cards: IntegrationCardModel[],
    seed: Record<string, ComponentSettings>,
): IntegrationSettingsState {
    const [settings, setSettings] = useState(seed);
    const [target, setTarget] = useState<SettingsTarget | null>(null);

    const withSettings = useMemo(() => withComponentSettings(cards, settings), [cards, settings]);
    const open = useCallback((model: IntegrationCardModel): void => {
        const id = model.componentId ?? model.id;
        const own = settings[id];
        if (own) setTarget({ id, name: model.name, settings: own });
    }, [settings]);
    const close = useCallback((): void => setTarget(null), []);
    const saved = useCallback((id: string, next: ComponentSettings): void => {
        setSettings((prev) => ({ ...prev, [id]: next }));
    }, []);

    return { cards: withSettings, open, target, close, saved };
}
