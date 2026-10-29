/**
 * pairNames — the names a paired integration and the system it brings get when the
 * pair is added, and the one rule every door applies.
 *
 * The SC names the SYSTEM; the integration keeps its catalog name. "Justrite" →
 * the ERP "Justrite ERP" beside "ERP Integration". One integration serves several
 * ERPs (Add another ERP), so naming it after the first one stopped being true at
 * the second (owner, 2026-10-06; it used to give "Justrite Integration"). A
 * trailing "ERP" or "Integration" on what was typed is dropped first, and nothing
 * typed gives "Acme ERP". The integration is renamed on its own afterwards.
 *
 * Shared by the wizard (what it records) and the extension's add doors (what they
 * enforce), so they cannot disagree.
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
 * The two names a pair is added with.
 *
 * @param typed - what the SC typed for the system, if anything
 * @param systemWord - what the system is ("ERP")
 * @param integrationName - the integration's own name (its catalog name)
 * @returns the integration's name and its system's
 */
export function pairNames(
    typed: string | undefined,
    systemWord: string,
    integrationName: string,
): { integration: string; system: string } {
    const base = stripTrailing(typed, [INTEGRATION_WORD, systemWord]) || DEFAULT_PAIR_BASE;
    return { integration: integrationName, system: `${base} ${systemWord}` };
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

/** The longest ERP name: it heads a card, a workspace title and the integration's Admin page. */
export const MAX_ERP_NAME = 40;

/**
 * Why a name cannot name a new ERP, or undefined when it can: blank, too long, or already
 * taken, compared without case (the integration refuses two ERPs of one name in its list,
 * `erpsProblem`). The one check the Add another ERP dialog shows and the extension enforces.
 *
 * @param name - the name the ERP would be added as (`withSystemWord`)
 * @param takenNames - the names already in the project (`takenSystemNames`)
 * @returns the problem in words
 */
export function erpNameProblem(name: string | undefined, takenNames: readonly string[]): string | undefined {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return 'Name the ERP, e.g. "Brand B ERP".';
    if (trimmed.length > MAX_ERP_NAME) return `An ERP name is at most ${MAX_ERP_NAME} characters.`;
    const lower = trimmed.toLowerCase();
    return takenNames.some((taken) => taken.trim().toLowerCase() === lower)
        ? `An ERP named "${trimmed}" is already in this project. Pick another name.`
        : undefined;
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
    const names = pairNames(typed, systemWordOf(system), entry.name);
    return {
        ...(entry.nameFromEnvVar ? { [entry.nameFromEnvVar]: names.integration } : {}),
        [system.nameFromEnvVar]: names.system,
    };
}
