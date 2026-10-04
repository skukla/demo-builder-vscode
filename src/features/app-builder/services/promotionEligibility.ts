/**
 * Which repository verb an integration offers (AB-1c): save it to GitHub, undo
 * that, or neither. One rule for the card (webview) and the handler (extension),
 * so the card never offers what the handler refuses. Webview-safe: no `fs`, no
 * `vscode` — only the bundled catalog lookups.
 *
 * @module features/app-builder/services/promotionEligibility
 */

import {
    getAppBuilderComponentEntry,
    isBlankSource,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentState } from '@/types/base';

type PromotionVerb = 'save' | 'undo';

/**
 * The verb, or why there is none.
 *
 * Only a NAMED blank-starter app can be saved. One keyed by the catalog's own id
 * (`app-builder-shell`, how a blank starter was added before instances had names)
 * is refused: every deploy resolves that id to the catalog entry and rewrites its
 * source back to the starter, and an export carries catalog ids by selection, not
 * by source — so the saved repository would be forgotten on the next redeploy.
 *
 * @param id - The component's id
 * @param state - Its persisted state
 */
export function promotionVerbOf(
    id: string,
    state: AppBuilderComponentState,
): { verb: PromotionVerb } | { refusal: string } {
    if (state.kind !== 'integration') return { refusal: 'Only an integration can be saved to GitHub.' };
    if (state.promotion) return { verb: 'undo' };
    if (getAppBuilderComponentEntry(state.catalogId ?? id)) {
        return {
            refusal:
                'Only a named copy of the blank starter can be saved; this one is the catalog ' +
                'entry itself. Add a new blank starter and build there.',
        };
    }
    if (!isBlankSource(state.source)) {
        return {
            refusal: `It already has its own repository, ${state.source.owner}/${state.source.repo}.`,
        };
    }
    return { verb: 'save' };
}
