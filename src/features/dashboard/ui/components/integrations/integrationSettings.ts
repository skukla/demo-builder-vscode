/**
 * Puts an integration's Settings on its card (AB-21): the "Settings" menu item,
 * and the one-line summary the flyout's Settings row shows.
 *
 * The extension decides which components have settings and sends them as
 * `componentSettings`; this only places them on the cards it already built.
 *
 * @module features/dashboard/ui/components/integrations/integrationSettings
 */

import type { CardAction, IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
import type { ComponentSettings, ComponentSettingField } from '@/types/appBuilderComponents';

function fieldSummary(field: ComponentSettingField): string {
    if (field.type === 'secret') return `${field.label}: ${field.isSet ? 'set' : 'not set'}`;
    return `${field.label}: ${field.value?.trim() ? field.value : 'not set'}`;
}

/** "ERP name: Acme ERP · API key: set" — every setting's current value in one line. */
export function settingsSummary(settings: ComponentSettings): string {
    return settings.fields.map(fieldSummary).join(' · ');
}

/**
 * Settings goes just before Manage APIs, else before Remove, else last. An empty
 * menu stays empty: mid-deploy every item would race the runner.
 */
function withSettingsItem(actions: CardAction[]): CardAction[] {
    if (actions.length === 0) return actions;
    const before = ['manage-apis', 'remove'].map((a) => actions.indexOf(a as CardAction)).find((i) => i >= 0);
    const at = before ?? actions.length;
    return [...actions.slice(0, at), 'settings', ...actions.slice(at)];
}

/**
 * The cards, with Settings added to each one whose component has settings.
 *
 * @param cards - the cards the screen derived
 * @param settings - component id → its settings, from the extension
 * @returns the same cards; those with settings gain the item and the summary
 */
export function withComponentSettings(
    cards: IntegrationCardModel[],
    settings: Record<string, ComponentSettings>,
): IntegrationCardModel[] {
    return cards.map((card) => {
        const own = settings[card.componentId ?? card.id];
        if (!own || own.fields.length === 0) return card;
        return { ...card, menuActions: withSettingsItem(card.menuActions), settingsSummary: settingsSummary(own) };
    });
}
