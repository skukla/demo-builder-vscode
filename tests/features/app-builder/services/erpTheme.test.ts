/**
 * erpTheme — the theme a freshly added ERP is moved to so it does not look like another ERP in
 * the project (AB-51). The looks below are the mock ERP's own theme expansions
 * (`skukla/demo-erp` `lib/appearance.js` THEMES, read 2026-10-03): harbour = teal/cube/rail,
 * meridian = indigo/orbit/top, granite = slate/layers/rail, foundry = bronze/monogram/top.
 */

import { themeForAddedErp } from '@/features/app-builder/services/erpTheme';
import type { ErpAppearance } from '@/types/erpDemoControls';

const HARBOUR: ErpAppearance = { palette: 'teal', logo: 'cube', nav: 'rail' };
const MERIDIAN: ErpAppearance = { palette: 'indigo', logo: 'orbit', nav: 'top' };
const GRANITE: ErpAppearance = { palette: 'slate', logo: 'layers', nav: 'rail' };
const FOUNDRY: ErpAppearance = { palette: 'bronze', logo: 'monogram', nav: 'top' };

describe('themeForAddedErp', () => {
    it('moves an ERP that looks like another to the first theme no other ERP uses', () => {
        // Justrite's two ERPs both hash to foundry; the first ERP keeps it.
        expect(themeForAddedErp(FOUNDRY, [FOUNDRY])).toBe('harbour');
    });

    it('skips the themes other ERPs already use, in the ERP\'s own order', () => {
        expect(themeForAddedErp(HARBOUR, [HARBOUR, MERIDIAN])).toBe('granite');
    });

    it('leaves an ERP that already looks different alone', () => {
        expect(themeForAddedErp(MERIDIAN, [FOUNDRY])).toBeUndefined();
    });

    it('leaves it alone when every theme is in use', () => {
        expect(themeForAddedErp(HARBOUR, [HARBOUR, MERIDIAN, GRANITE, FOUNDRY])).toBeUndefined();
    });

    it('counts a hand-set look by its colour: same colour, other logo and menu, still the same', () => {
        const bronzeHarbour: ErpAppearance = { palette: 'bronze', logo: 'cube', nav: 'rail' };
        expect(themeForAddedErp(FOUNDRY, [bronzeHarbour])).toBe('harbour');
    });

    it('does not count a colour no theme has (plum) as using a theme', () => {
        const plum: ErpAppearance = { palette: 'plum', logo: 'cube', nav: 'rail' };
        expect(themeForAddedErp(plum, [plum])).toBe('harbour');
    });

    it('leaves it alone when it is the only ERP', () => {
        expect(themeForAddedErp(FOUNDRY, [])).toBeUndefined();
    });
});
