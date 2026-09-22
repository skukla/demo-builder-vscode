/**
 * The id a COPY of an App Management app declares to Commerce.
 *
 * Commerce knows an app by its `metadata.id` and names every webhook and event
 * subscription from it, so two copies on one store need different ids — the
 * collision measured live on 2026-09-22, where the older copy's uninstall deleted
 * the newer one's webhooks because both were called `commerce-erp-integration`.
 *
 * The id the SC can read beats a counter: `contoso_erp_erp_contract_price` says which
 * ERP it belongs to on Commerce's Webhooks List; `erp_integration_2_…` does not. So
 * it is the name they typed, slugged (owner, 2026-09-22), with the copy id —
 * `erp-integration-2` — as the fallback for a name already used by another copy here,
 * or no name at all.
 *
 * FIXED AT FIRST INSTALL: Commerce refuses an id change on an upgrade, so the caller
 * records what this answers and reuses it for every later deploy. A rename after the
 * fact moves the label, never the id.
 *
 * The FIRST copy of a kind never comes here: it keeps the id its app declares, which
 * is what it was installed with.
 *
 * @module features/app-builder/services/commerceAppId
 */

import { pairedInstanceId } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** Adobe accepts letters, digits and hyphens, up to 100 characters. */
const CAP = 60;

export interface CommerceAppIdInput {
    /** The name the SC gave this copy, when they gave one. */
    typedName: string | undefined;
    /** The fallback: this copy's component id (`erp-integration-2`). */
    copyId: string;
    /** The ids other copies on this Commerce store already declare. */
    taken: readonly string[];
}

/**
 * Slug a display name into an id: lower case, every run of anything else one hyphen,
 * trimmed, capped.
 */
function slug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, CAP)
        .replace(/-+$/g, '');
}

/**
 * The prefix the library builds from an id to decide which webhooks are an app's
 * (`buildWebhookIdPrefix`: lower case, non-identifier characters to `_`, trailing `_`).
 * Two ids collide when either prefix starts with the other.
 */
function webhookPrefix(id: string): string {
    return `${id.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_`;
}

/** Whether `candidate` could claim, or be claimed by, a webhook of one already in use. */
function collides(candidate: string, taken: readonly string[]): boolean {
    const mine = webhookPrefix(candidate);
    return taken.some((other) => {
        const theirs = webhookPrefix(other);
        return mine.startsWith(theirs) || theirs.startsWith(mine);
    });
}

/**
 * The id this copy should declare to Commerce.
 *
 * @param input - the typed name, the copy's own id, and the ids already in use
 * @returns the slugged name, or the copy id when that name is unusable or taken
 */
export function deriveCommerceAppId({ typedName, copyId, taken }: CommerceAppIdInput): string {
    const fromName = slug(typedName ?? '');
    if (!fromName || collides(fromName, taken)) return copyId;
    return fromName;
}

/**
 * The id a copy declares, recorded on the component the first time it deploys.
 *
 * Recorded rather than re-derived, because Commerce refuses an id change on an
 * upgrade: a rename afterwards moves the label and leaves this alone. Only a COPY
 * gets one — the first of a kind keeps the id its app ships with.
 *
 * @param project - the project (mutated when an id is recorded)
 * @param entry - the entry being deployed
 * @param catalog - for the bound system whose input carries the SC's name
 * @returns the id recorded, or undefined for an entry that needs none
 */
export function ensureCommerceAppId(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): string | undefined {
    const state = project.appBuilderComponents?.[entry.id];
    const isCopy = Boolean(entry.catalogId && entry.id !== entry.catalogId);
    if (!state || !isCopy || entry.lifecycle !== 'app-management') return undefined;
    if (state.commerceAppId) return state.commerceAppId;

    const id = deriveCommerceAppId({
        typedName: typedNameFor(project, entry, catalog),
        copyId: entry.id,
        // The ids already on this Commerce store: what the other copies declare, plus
        // the id the FIRST of this kind ships with — its app's own `metadata.id`,
        // which is its repository's name.
        taken: [
            entry.source.repo,
            ...Object.entries(project.appBuilderComponents ?? {})
                .filter(([id]) => id !== entry.id)
                .map(([, other]) => other.commerceAppId)
                .filter((value): value is string => Boolean(value)),
        ],
    });
    state.commerceAppId = id;
    return id;
}

/**
 * The name the SC typed for this copy, if they typed one: the value set for the
 * input its bound system is NAMED from (`nameFromEnvVar`), on this entry or on its
 * partner. A default the catalog supplies is not a typed name.
 */
function typedNameFor(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: readonly AppBuilderComponentCatalogEntry[],
): string | undefined {
    const system = catalog.find((candidate) => candidate.boundTo === entry.catalogId);
    const key = system?.nameFromEnvVar;
    if (!key) return undefined;
    const partner = system ? pairedInstanceId(entry.id, entry.catalogId, system.id) : undefined;
    for (const id of [entry.id, partner]) {
        const value = id ? project.componentConfigs?.[id]?.[key] : undefined;
        if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
}
