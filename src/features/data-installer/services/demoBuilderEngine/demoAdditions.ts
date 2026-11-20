/**
 * What this demo uses that its installed datapack does not hold yet (walk F85): what the SC added in
 * the Admin since the install. A save from a pack takes it (`saveStore.ts`); "Save Changes to My
 * Luma" counts it as "N added" before the save (step-07 E1, P4-Q3). One rule for both, so the count
 * is what the save takes: this demo's rows (`demoUses.ts`) less what the pack and its install record
 * hold (`holdsOf`). Another demo's records on the same instance are not this demo's, so neither
 * counts them.
 *
 * Reads only.
 *
 * @module features/data-installer/services/demoBuilderEngine/demoAdditions
 */

import {
    PICKABLE_KINDS,
    type PickableKind,
    type StoreItem,
    type StorePicks,
} from '../../pickableKinds';
import type { ChangedKind } from '../../removalChanges';
import { demoUses } from './demoUses';
import { type CreatedObject, nodeRecordFiles, readInstallRecord } from './installRecord';
import type { KindContext } from './kindContext';
import { named } from './saveOutcome';
import { type StoreChangesDeps, openStore, readInstalled } from './storeAccess';
import { holdsOf, readWebsiteProductsWhole } from './storeItems';
import type { CommerceProduct } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** This demo's items of each kind that the pack does not hold, kinds with none left out. */
type Additions = Array<readonly [PickableKind, StoreItem[]]>;

/**
 * Everything this demo uses that the pack does not hold yet, by kind. A kind the store cannot list
 * throws, so a save stops rather than save the demo without it.
 */
async function demoAdditions(
    ctx: KindContext,
    created: readonly CreatedObject[],
    rows: Record<string, unknown>,
    websiteProducts: Promise<CommerceProduct[]> | undefined,
): Promise<Additions> {
    const uses = demoUses(ctx, websiteProducts);
    const added = await Promise.all(
        PICKABLE_KINDS.map(async (kind) => {
            const started = Date.now();
            const holds = holdsOf(kind, created, rows);
            const items = (await uses.of(kind)).filter((item) => !holds(item));
            ctx.log(
                `what the demo uses: ${kind} in ${Date.now() - started} ms, ${items.length} not in the pack`,
            );
            return [kind, items] as const;
        }),
    );
    return added.filter(([, items]) => items.length > 0);
}

/** What a save takes beyond the record, as picks: each kind's ids. */
export async function demoPicks(
    ctx: KindContext,
    created: readonly CreatedObject[],
    rows: Record<string, unknown>,
    websiteProducts: Promise<CommerceProduct[]> | undefined,
): Promise<StorePicks> {
    const added = await demoAdditions(ctx, created, rows, websiteProducts);
    return Object.fromEntries(added.map(([kind, items]) => [kind, items.map((item) => item.id)]));
}

/** The demo's picks and the SC's, each id once. */
export function withPicks(demo: StorePicks, chosen: StorePicks | undefined): StorePicks {
    const all: StorePicks = { ...demo };
    for (const kind of PICKABLE_KINDS) {
        const more = chosen?.[kind] ?? [];
        if (more.length > 0) all[kind] = [...new Set([...(all[kind] ?? []), ...more])];
    }
    return all;
}

/**
 * What the SC added by hand since the install, by kind, with a few names: what a save from this pack
 * would take that it does not hold. None when Demo Builder has no install record of it, since
 * nothing can then be told apart. The website's products are read whole once, as the save reads
 * them, so a save that follows within the read window reuses the read (`commerceReadWindow`).
 *
 * @param source - the store holding the installed version; the library, then the Data Installer, when absent
 */
export async function addedSinceInstall(
    deps: StoreChangesDeps,
    pack: DatapackId,
    source?: DatapackStoreName,
): Promise<ChangedKind[]> {
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack);
    if (!record) return [];
    const installed = await readInstalled(deps, { pack, ...(source ? { source } : {}) });
    const ctx = await openStore(deps, pack, record);
    const added = await demoAdditions(
        ctx,
        record.created,
        installed.rows,
        readWebsiteProductsWhole(ctx),
    );
    return added.map(([kind, items]) => ({
        kind,
        ...named(items.map((item) => item.displayName)),
    }));
}
