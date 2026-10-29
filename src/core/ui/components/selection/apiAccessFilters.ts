/**
 * Which APIs the picker offers, and how its product pills group them.
 *
 * Pure functions over {@link ApiAccessOption}, no rendering: which rows are
 * pickable, how a search query matches, the checked-first sort's tie-break, and
 * the two pill lenses (the curated Adobe Commerce / App Builder pair, and
 * Adobe's own cloud families minus the excluded ones). Split out of
 * ApiAccessPicker.tsx on 2026-10-09 (EDS-8): this half changes when the product
 * grouping changes, the picker when the screen does.
 *
 * @module core/ui/components/selection/apiAccessFilters
 */

import type { ApiAccessOption } from './ApiAccessPicker';
import type { CloudGrouping } from '@/types/adobeApis';

/** A product-family filter chip. `code === null` is the "All" chip. */
interface FamilyChip {
    code: string | null;
    name: string;
}

export function byDisplayName(a: ApiAccessOption, b: ApiAccessOption): number {
    return a.name.localeCompare(b.name);
}

/** A pickable free API: not locked, not profile-bound, not review-gated. */
export function isPickable(api: ApiAccessOption): boolean {
    return !api.locked && !api.requiresProfile && !api.requiresReview;
}

/** The pickable rows — the set the product pills are built from. */
export function pickableApis(apis: ApiAccessOption[]): ApiAccessOption[] {
    return apis.filter(isPickable);
}

/** Case-insensitive match across display name AND code. */
export function matchesQuery(api: ApiAccessOption, query: string): boolean {
    return `${api.name} ${api.code}`.toLowerCase().includes(query);
}

/**
 * The CURATED half of the pill row.
 *
 * Adobe groups services by CLOUD (Experience / Creative / Document), which is a
 * useful lens but not the one a Commerce demo thinks in: everything this
 * extension deploys lands in a cloud bucket alongside unrelated products. These
 * two pills are the product-level grouping the tool actually needs, layered ON
 * TOP of the cloud families rather than replacing them — an API keeps its cloud
 * pill and gains a curated one, so clicking "Experience Cloud" still shows
 * everything Adobe puts there.
 *
 * Matched by keyword over `name + code` rather than an sdkCode allowlist: Adobe
 * adds services, and an allowlist goes stale silently — a new Commerce API would
 * never appear under its pill with nothing to notice. A keyword miss is visible
 * and is one pattern to widen.
 *
 * Codes are namespaced so a curated pill can never collide with a cloud family's
 * code, since both share one selection slot.
 */
const API_FAMILIES: ReadonlyArray<{ code: string; name: string; pattern: RegExp }> = [
    { code: 'curated:commerce', name: 'Adobe Commerce', pattern: /commerce/i },
    {
        code: 'curated:app-builder',
        name: 'App Builder',
        pattern: /app\s*builder|adobe\s*i\/?o|runtime|api\s*mesh|graphql\s*service/i,
    },
];

/**
 * Cloud families that get no pill. Their APIs stay listed under "All" — the pill
 * is the noise, not the service, and this picker is the only surface that can
 * subscribe one.
 *
 * Matched on the display NAME: the catalog's family CODES are Adobe's and
 * undocumented here, so keying off them would be a guess that fails silently.
 */
const EXCLUDED_CLOUD_PILLS = /^(document|creative)\s+cloud$/i;

/** The curated pill an API matches, if any. */
function curatedFamilyOf(api: ApiAccessOption): string | undefined {
    const haystack = `${api.name} ${api.code}`;
    return API_FAMILIES.find((family) => family.pattern.test(haystack))?.code;
}

/** The API's cloud family, unless that family is one we deliberately hide. */
function cloudFamilyOf(api: ApiAccessOption): CloudGrouping | undefined {
    const group = api.group;
    if (!group || EXCLUDED_CLOUD_PILLS.test(group.name)) return undefined;
    return group;
}

/**
 * Every family code an API belongs to — at most one curated and one cloud.
 * Membership is a SET because the two lenses overlap by design.
 */
export function familiesOf(api: ApiAccessOption): string[] {
    const codes: string[] = [];
    const curated = curatedFamilyOf(api);
    if (curated) codes.push(curated);
    const cloud = cloudFamilyOf(api);
    if (cloud) codes.push(cloud.code);
    return codes;
}

/**
 * "All", then the curated pills in declared order, then the cloud families
 * alphabetically — curated first because they are the ones this tool's users
 * reach for.
 *
 * A pill nothing matches is omitted, and an empty set hides the row: chips that
 * filter to nothing are noise. There is deliberately no "Other" pill — ungrouped
 * APIs stay reachable under "All", so the pills narrow rather than partition.
 */
export function familyChips(pickable: ApiAccessOption[]): FamilyChip[] {
    const curated = API_FAMILIES.filter((family) =>
        pickable.some((api) => curatedFamilyOf(api) === family.code),
    ).map(({ code, name }) => ({ code, name }));

    const clouds = new Map<string, string>();
    for (const api of pickable) {
        const cloud = cloudFamilyOf(api);
        if (cloud) clouds.set(cloud.code, cloud.name);
    }
    const cloudChips = [...clouds.entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (curated.length === 0 && cloudChips.length === 0) return [];
    return [{ code: null, name: 'All' }, ...curated, ...cloudChips];
}
