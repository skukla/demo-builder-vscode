/**
 * The mock ERP's demo controls, on its card in Demo Builder (AB-59): how its screen looks, and a
 * simulated downtime (the ERP's maintenance window). They left the ERP's own Settings screen so
 * an SC changing a real ERP setting mid-demo never meets them (owner, 2026-10-02).
 *
 * The choices are the mock ERP's own, copied from `skukla/demo-erp` `lib/appearance.js` (read
 * 2026-10-02): its THEMES (each a palette, a logo and a menu position) and its PALETTES (each
 * swatch is the palette's `--accent`). The ERP IGNORES an id it does not know rather than
 * refusing it, so a stale id here would save as no change at all; the handler refuses an id
 * outside these lists instead. The window's bounds are its `lib/maintenance.js`.
 *
 * Browser-safe: the webview and the extension both read this file.
 *
 * @module types/erpDemoControls
 */

/** The ERP's themes: one choice that sets its colour, its logo and where its menu sits. */
export const ERP_THEMES = [
    { id: 'harbour', label: 'Harbour', palette: 'teal', logo: 'cube', nav: 'rail' },
    { id: 'meridian', label: 'Meridian', palette: 'indigo', logo: 'orbit', nav: 'top' },
    { id: 'granite', label: 'Granite', palette: 'slate', logo: 'layers', nav: 'rail' },
    { id: 'foundry', label: 'Foundry', palette: 'bronze', logo: 'monogram', nav: 'top' },
] as const;

/** The ERP's colours, each with the accent its swatch shows. */
export const ERP_PALETTES = [
    { id: 'teal', label: 'Teal', accent: '#0f6b68' },
    { id: 'indigo', label: 'Indigo', accent: '#3a4da8' },
    { id: 'slate', label: 'Slate', accent: '#47535f' },
    { id: 'bronze', label: 'Bronze', accent: '#8a5a1f' },
    { id: 'plum', label: 'Plum', accent: '#7a3a6b' },
] as const;

/** A simulated downtime's length in minutes: the ERP's default, and its bounds. */
export const ERP_DOWNTIME_MINUTES = { default: 30, min: 1, max: 24 * 60 } as const;

/** How the ERP looks, as its `GET health` and its settings answer it. */
export interface ErpAppearance {
    palette: string;
    logo: string;
    nav: string;
}

/** A maintenance window in force: when it ends, and the ERP's own sentence for it. */
export interface ErpMaintenance {
    until: string;
    message: string;
}

/** Which ERP: the integration that serves it, and the ERP's component id (absent = the first). */
export interface ErpDemoControlsPayload {
    id?: string;
    erp?: string;
}

/** `setErpAppearance`: a theme, a colour, or both (the colour wins over the theme's). */
export interface SetErpAppearancePayload extends ErpDemoControlsPayload {
    theme?: string;
    palette?: string;
}

/** `startErpDowntime`: how long the ERP answers as if down (default 30 minutes). */
export interface StartErpDowntimePayload extends ErpDemoControlsPayload {
    minutes?: number;
}

/**
 * What the four demo-control handlers answer (Pattern B): `getErpDemoControls` both fields,
 * `setErpAppearance` the appearance, the downtime pair the window (`null` once it has ended).
 */
export interface ErpDemoControlsResult {
    success: boolean;
    error?: string;
    code?: string;
    data?: {
        id: string;
        appearance?: ErpAppearance | null;
        maintenance?: ErpMaintenance | null;
    };
}
