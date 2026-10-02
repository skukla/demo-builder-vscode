/**
 * The mock ERP's demo controls, on its card in Demo Builder (AB-59): how its screen looks, and a
 * simulated downtime (its maintenance window, during which it answers as a real ERP does when
 * down, so the integration's handling of that can be shown). They left the ERP's own Settings
 * screen so an SC changing a real ERP setting mid-demo never meets them (owner, 2026-10-02).
 *
 * - `getErpDemoControls` — the ERP's look and any window in force (`GET health`).
 * - `setErpAppearance` — a theme and/or a colour (`PATCH settings { appearance }`).
 * - `startErpDowntime` / `endErpDowntime` — `POST` / `DELETE settings/maintenance`.
 *
 * The routes and bodies are the mock ERP's (`skukla/demo-erp` `actions/settings/index.js`,
 * `actions/health/index.js`, read 2026-10-02). Each reaches the ERP the way every ERP verb does
 * (`callOwnErp`): the integration's id, the ERP named (else its first), the signed-in identity.
 * Headless-safe, so the agent tools dispatch into the same handlers.
 *
 * @module features/dashboard/handlers/erpDemoControlHandlers
 */

import { callOwnErp, shapeErpRow, type ErpRouteRequest } from './erpCall';
import {
    ERP_DOWNTIME_MINUTES,
    ERP_PALETTES,
    ERP_THEMES,
    type ErpAppearance,
    type ErpDemoControlsPayload,
    type ErpMaintenance,
    type SetErpAppearancePayload,
    type StartErpDowntimePayload,
} from '@/types/erpDemoControls';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';

/** What the ERP's `GET health` and its settings and maintenance routes answer, in part. */
interface ErpDemoAnswer {
    appearance?: ErpAppearance;
    maintenance?: ErpMaintenance | null;
}

/** Call the ERP, then answer the fields of its reply the control is about. */
async function demoControl(
    context: HandlerContext,
    payload: ErpDemoControlsPayload | undefined,
    request: ErpRouteRequest,
    pick: (answer: ErpDemoAnswer) => Record<string, unknown>,
): Promise<HandlerResponse> {
    const reached = await callOwnErp(context, payload, request, "use the ERP's demo controls");
    if ('error' in reached) return reached.error;
    return {
        success: true,
        data: {
            id: reached.call.id,
            erp: shapeErpRow(reached.erp),
            ...pick((reached.body ?? {}) as ErpDemoAnswer),
        },
    };
}

function invalid(error: string): HandlerResponse {
    return { success: false, error, code: ErrorCode.CONFIG_INVALID };
}

/** Handle 'getErpDemoControls' — the ERP's look, and the downtime running now (or null). */
export const handleGetErpDemoControls: MessageHandler<ErpDemoControlsPayload> = (
    context,
    payload,
) =>
    demoControl(context, payload, { method: 'GET', route: 'health' }, (answer) => ({
        appearance: answer.appearance ?? null,
        maintenance: answer.maintenance ?? null,
    }));

const THEME_IDS: readonly string[] = ERP_THEMES.map((theme) => theme.id);
const PALETTE_IDS: readonly string[] = ERP_PALETTES.map((palette) => palette.id);

/**
 * Handle 'setErpAppearance' — dress the ERP in a theme, a colour, or both (the colour wins over
 * the theme's own). An id the ERP does not know is refused here: the ERP would ignore it and
 * answer as if it had saved.
 */
export const handleSetErpAppearance: MessageHandler<SetErpAppearancePayload> = (
    context,
    payload,
) => {
    const theme = payload?.theme;
    const palette = payload?.palette;
    if (theme === undefined && palette === undefined) {
        return Promise.resolve(invalid('Choose a theme or a colour for the ERP.'));
    }
    if (theme !== undefined && !THEME_IDS.includes(theme)) {
        return Promise.resolve(invalid(`The ERP's themes are ${THEME_IDS.join(', ')}.`));
    }
    if (palette !== undefined && !PALETTE_IDS.includes(palette)) {
        return Promise.resolve(invalid(`The ERP's colours are ${PALETTE_IDS.join(', ')}.`));
    }
    const appearance = { ...(theme ? { theme } : {}), ...(palette ? { palette } : {}) };
    return demoControl(
        context,
        payload,
        { method: 'PATCH', route: 'settings', body: { appearance } },
        (answer) => ({ appearance: answer.appearance ?? null }),
    );
};

/**
 * Handle 'startErpDowntime' — the ERP answers as if down for maintenance for `minutes` (30 by
 * default, up to a day), then comes back by itself. Starting again restarts the window.
 */
export const handleStartErpDowntime: MessageHandler<StartErpDowntimePayload> = (
    context,
    payload,
) => {
    const minutes = payload?.minutes ?? ERP_DOWNTIME_MINUTES.default;
    const { min, max } = ERP_DOWNTIME_MINUTES;
    if (!Number.isInteger(minutes) || minutes < min || minutes > max) {
        return Promise.resolve(invalid(`A downtime lasts ${min} to ${max} minutes.`));
    }
    return demoControl(
        context,
        payload,
        { method: 'POST', route: 'settings/maintenance', body: { minutes } },
        (answer) => ({ maintenance: answer.maintenance ?? null }),
    );
};

/** Handle 'endErpDowntime' — bring the ERP back now. */
export const handleEndErpDowntime: MessageHandler<ErpDemoControlsPayload> = (context, payload) =>
    demoControl(
        context,
        payload,
        { method: 'DELETE', route: 'settings/maintenance' },
        (answer) => ({ maintenance: answer.maintenance ?? null }),
    );
