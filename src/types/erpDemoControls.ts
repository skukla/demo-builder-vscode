/**
 * The mock ERP's demo controls (AB-59): how its screen looks (agents only, `set_erp_appearance`;
 * people set it on the ERP's own screen, owner 2026-10-02), and a simulated downtime (the ERP's
 * maintenance window), which is also on its card in Demo Builder.
 *
 * The ids are the mock ERP's own, copied from `skukla/demo-erp` `lib/appearance.js` (read
 * 2026-10-02): its THEMES and its PALETTES. The ERP IGNORES an id it does not know rather than
 * refusing it, so a stale id here would save as no change at all; the handler refuses an id
 * outside these lists instead. The window's bounds are its `lib/maintenance.js`.
 *
 * Browser-safe: the webview and the extension both read this file.
 *
 * @module types/erpDemoControls
 */

/** The ERP's themes: one choice that sets its colour, its logo and where its menu sits. */
export const ERP_THEME_IDS = ['harbour', 'meridian', 'granite', 'foundry'] as const;

export type ErpThemeId = (typeof ERP_THEME_IDS)[number];

/** The ERP's colours. */
export const ERP_PALETTE_IDS = ['teal', 'indigo', 'slate', 'bronze', 'plum'] as const;

/**
 * The colour each theme sets (its THEMES entry's `palette`). No two themes share one, so an
 * ERP's colour says which theme it shows; plum is reachable from the colour control alone.
 */
export const ERP_THEME_PALETTES: Readonly<Record<ErpThemeId, string>> = {
    harbour: 'teal',
    meridian: 'indigo',
    granite: 'slate',
    foundry: 'bronze',
};

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
