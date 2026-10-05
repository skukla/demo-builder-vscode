/**
 * pairNames — the two names ONE typed name gives a paired integration and the
 * system it brings, and the one rule every door applies (owner, 2026-10-05).
 *
 * "Justrite" → the integration "Justrite Integration" and its ERP "Justrite ERP".
 * The SC types one name; the screen used to call it "Name" with the integration's
 * default as the placeholder while it actually named the ERP, so "Multi-ERP
 * Integration" became an ERP called "...Integration" beside an integration still
 * called "ERP Integration". A typed name that already ends in either word gives the
 * same pair, and an empty one gives the defaults, "Acme Integration" and "Acme ERP".
 *
 * Shared by the add screen (its preview), the wizard (what it records), and the
 * extension's add doors (what they enforce), so the three cannot disagree.
 *
 * @module features/app-builder/services/pairNames
 */

import { systemBoundTo } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** The name a pair gets when the SC types none. */
export const DEFAULT_PAIR_BASE = 'Acme';

/** The word an integration's name ends in. */
const INTEGRATION_WORD = 'Integration';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The typed name without any trailing `words`, in any order or case. */
function stripTrailing(typed: string | undefined, words: string[]): string {
    const tail = new RegExp(`(?:^|\\s+)(?:${words.map(escapeRegExp).join('|')})$`, 'i');
    let base = (typed ?? '').trim().replace(/\s+/g, ' ');
    for (let previous = ''; previous !== base; ) {
        previous = base;
        base = base.replace(tail, '').trim();
    }
    return base;
}

/**
 * The two names one typed name gives a pair.
 *
 * @param typed - what the SC typed, if anything
 * @param systemWord - what the system is ("ERP")
 * @returns the integration's name and its system's
 */
export function pairNames(typed: string | undefined, systemWord: string): { integration: string; system: string } {
    const base = stripTrailing(typed, [INTEGRATION_WORD, systemWord]) || DEFAULT_PAIR_BASE;
    return { integration: `${base} ${INTEGRATION_WORD}`, system: `${base} ${systemWord}` };
}

/**
 * A system's name ending in what it is: "Accuform" → "Accuform ERP", and
 * "Accuform erp" → "Accuform ERP". For a system added on its own (Add another ERP).
 *
 * @param typed - the name the SC typed
 * @param systemWord - what the system is ("ERP")
 * @returns the name, ending in `systemWord`; empty when nothing was typed
 */
export function withSystemWord(typed: string, systemWord: string): string {
    if (!typed.trim()) return '';
    const base = stripTrailing(typed, [systemWord]);
    return base ? `${base} ${systemWord}` : systemWord;
}

/** The system bound to this integration, when it brings one that is named from an input. */
export function pairedSystemOf(
    entry: AppBuilderComponentCatalogEntry,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): AppBuilderComponentCatalogEntry | undefined {
    const system = systemBoundTo(entry.catalogId ?? entry.id, catalog);
    return system?.nameFromEnvVar ? system : undefined;
}

/** What a system is called as a word: its type ("ERP"), else its catalog name. */
export function systemWordOf(system: AppBuilderComponentCatalogEntry): string {
    return system.systemType ?? system.name;
}

/**
 * The inputs that name a pair, keyed as each side's deploy reads them — recorded on
 * the INTEGRATION, which its bound system reads first. `undefined` for an entry that
 * brings no named system.
 *
 * @param entry - the integration being added
 * @param catalog - the catalog, to find its system
 * @param typed - what the SC typed, if anything
 * @returns the integration's and the system's name inputs
 */
export function pairNameInputs(
    entry: AppBuilderComponentCatalogEntry,
    catalog: readonly AppBuilderComponentCatalogEntry[],
    typed: string | undefined,
): Record<string, string> | undefined {
    const system = pairedSystemOf(entry, catalog);
    if (!system?.nameFromEnvVar) return undefined;
    const names = pairNames(typed, systemWordOf(system));
    return {
        ...(entry.nameFromEnvVar ? { [entry.nameFromEnvVar]: names.integration } : {}),
        [system.nameFromEnvVar]: names.system,
    };
}
