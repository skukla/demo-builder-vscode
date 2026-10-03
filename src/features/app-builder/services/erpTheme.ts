/**
 * The theme a freshly added ERP is moved to, so two ERPs side by side look different from the
 * start (AB-51). The ERP picks its own starting theme from a hash of its list id and cannot see
 * the other ERPs, so two can land on one (Justrite's `justrite` and `accuform` both hash to
 * foundry); Demo Builder sees them all.
 *
 * Two ERPs look the same when they share a COLOUR. The ERP stores a look (colour, logo, menu
 * side), not a theme, and every theme has a colour of its own (`ERP_THEME_PALETTES`), so on
 * looks nobody touched comparing colours is comparing themes. On a hand-set look colour is what
 * the eye reads first: two bronze screens with different logos still read as one.
 *
 * Pure: the add step reads the looks and writes the theme.
 *
 * @module features/app-builder/services/erpTheme
 */

import {
    ERP_THEME_IDS,
    ERP_THEME_PALETTES,
    type ErpAppearance,
    type ErpThemeId,
} from '@/types/erpDemoControls';

/**
 * The theme to give the added ERP: the first, in the ERP's own theme order, whose colour no
 * other ERP shows — only when its colour is another's. `undefined` = leave it as it is
 * (already different, or every theme in use).
 *
 * @param added - the added ERP's look, as its `GET health` answers it
 * @param others - every other ERP's look in the project
 */
export function themeForAddedErp(
    added: ErpAppearance,
    others: readonly ErpAppearance[],
): ErpThemeId | undefined {
    const taken = new Set(others.map((look) => look.palette));
    if (!taken.has(added.palette)) return undefined;
    return ERP_THEME_IDS.find((theme) => !taken.has(ERP_THEME_PALETTES[theme]));
}
