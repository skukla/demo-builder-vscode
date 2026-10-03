/**
 * The step of "Add another ERP" (`addErp`) that gives the new ERP a look no other ERP in the
 * project has (AB-51). The ERP picks its starting theme from a hash of its own id and cannot see
 * the others, so two can land on one; Demo Builder reads every ERP's look and, when the new one
 * shares another's colour, moves it to the first theme nobody uses (`themeForAddedErp`).
 *
 * It reads and writes through the demo-control handlers `set_erp_appearance` dispatches into
 * (`GET health`, `PATCH settings { appearance: { theme } }`), so there is one way to write a
 * look. It runs once, on an ERP this add deployed, so a look someone set is never replaced.
 * Never throws: what it could not do is the add's warning, and the add stands.
 *
 * @module features/dashboard/handlers/erpAddTheme
 */

import { erpsOf, sentence } from './erpCall';
import { handleGetErpDemoControls, handleSetErpAppearance } from './erpDemoControlHandlers';
import { themeForAddedErp } from '@/features/app-builder/services/erpTheme';
import type { Project } from '@/types/base';
import type { ErpAppearance, ErpThemeId } from '@/types/erpDemoControls';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** What the step did: the theme it gave the new ERP, or why it could not check or change it. */
export interface ErpAddTheme {
    theme?: ErpThemeId;
    warning?: string;
}

const SET_IT_YOURSELF = 'Set it with set_erp_appearance or on its Settings screen.';

function isLook(value: unknown): value is ErpAppearance {
    return typeof value === 'object' && value !== null && 'palette' in value && typeof value.palette === 'string';
}

/** The look in a `getErpDemoControls` answer; `null` when the ERP has none (code from before looks). */
function lookIn(answer: HandlerResponse): ErpAppearance | null {
    const data = answer.data;
    if (typeof data !== 'object' || data === null || !('appearance' in data)) return null;
    return isLook(data.appearance) ? data.appearance : null;
}

/** Every ERP's look, the added one apart; the reason when one could not be read. */
async function readLooks(
    context: HandlerContext,
    project: Project,
    integrationId: string,
    erpId: string,
): Promise<{ added: ErpAppearance | null; others: ErpAppearance[] } | { notRead: string }> {
    const ids = erpsOf(project, integrationId).map((erp) => erp.id);
    const answers = await Promise.all(
        ids.map((id) => handleGetErpDemoControls(context, { id: integrationId, erp: id })),
    );
    const failed = answers.find((answer) => !answer.success);
    if (failed) return { notRead: failed.error ?? 'no reason given' };
    const index = ids.indexOf(erpId);
    const added = index >= 0 ? lookIn(answers[index]) : null;
    const others = answers.filter((_, at) => at !== index).map(lookIn).filter(isLook);
    return { added, others };
}

/**
 * Read every ERP's look; when the added ERP's colour is another's, give it the first theme no
 * other ERP shows.
 *
 * @param project - the project, with the added ERP already linked to the integration
 * @param erpId - the added ERP's component id (`demo-erp-2`)
 */
export async function giveAddedErpItsOwnTheme(
    context: HandlerContext,
    project: Project,
    integrationId: string,
    erpId: string,
): Promise<ErpAddTheme> {
    const name = project.appBuilderComponents?.[erpId]?.name ?? erpId;
    const looks = await readLooks(context, project, integrationId, erpId);
    if ('notRead' in looks) {
        return {
            warning: `${name}'s look was not checked against the other ERPs: ${sentence(looks.notRead)} ${SET_IT_YOURSELF}`,
        };
    }
    const theme = looks.added ? themeForAddedErp(looks.added, looks.others) : undefined;
    if (!theme) return {};
    const saved = await handleSetErpAppearance(context, { id: integrationId, erp: erpId, theme });
    if (!saved.success) {
        return {
            warning: `${name} looks like another ERP and its theme could not be changed to ${theme}: ${sentence(saved.error ?? 'no reason given')} ${SET_IT_YOURSELF}`,
        };
    }
    return { theme };
}
