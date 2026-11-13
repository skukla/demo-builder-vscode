/**
 * What install records list, as ids by kind: never touched by a wipe (`readWipeClaims` reads the
 * records). Products, categories, customers, cart rules and coupons are judged against the records on
 * the chosen websites. Companies, shared catalogs, customer groups, attribute sets and attributes are
 * instance-wide things, so another website's pack may have made one the chosen stores also use: those
 * are judged against every record of every local project.
 *
 * An attribute a record names only inside an option (`<code>/<option id>`) or an assignment
 * (`<set id>/<code>`) counts as listed too, and so do the set of that assignment and the catalog and
 * company of a catalog assignment (`<catalog id>/<company id>`).
 *
 * @module features/data-installer/services/demoDataWipe/wipeRecorded
 */

import { ASSIGNMENT_KIND, ATTRIBUTE_SET_KIND } from '../demoBuilderEngine/attributeSetsKind';
import { ATTRIBUTE_KIND, ATTRIBUTE_OPTION_KIND } from '../demoBuilderEngine/attributesKind';
import { CATALOG_CATEGORIES_KIND, CATALOG_COMPANIES_KIND, CATALOG_KIND, CATALOG_PRODUCTS_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from '../demoBuilderEngine/b2bKeys';
import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { STORE_CONFIG_KIND } from '../demoBuilderEngine/storeConfigKind';
import { resolveInstallTarget } from '../sampleDataInstall';
import type { Project } from '@/types/base';

/** What the records on the chosen websites list. */
export type Recorded = Record<'products' | 'categories' | 'customers' | 'rules' | 'coupons', Set<string>>;

/** What every record of every local project lists, of the instance-wide kinds. */
export type RecordedOnInstance = Record<'companies' | 'catalogs' | 'groups' | 'customers' | 'sets' | 'attributes', Set<string>>;

const idsOf = (records: readonly InstallRecord[], kinds: readonly string[]): string[] => records.flatMap((r) => r.created.filter((o) => kinds.includes(o.kind)).map((o) => o.id));

export function recordedIds(records: readonly InstallRecord[]): Recorded {
    return {
        // A gift card is a product (step 11).
        products: new Set(idsOf(records, ['products', 'giftcards']).map((sku) => sku.toLowerCase())),
        categories: new Set(idsOf(records, ['categories'])),
        customers: new Set(idsOf(records, [CUSTOMER_KIND])),
        rules: new Set(idsOf(records, ['cart_rules'])),
        coupons: new Set(idsOf(records, ['coupons'])),
    };
}

const before = (id: string): string => id.split('/')[0];
const after = (id: string): string => id.split('/')[1] ?? '';

export function recordedOnInstance(records: readonly InstallRecord[]): RecordedOnInstance {
    const assignments = idsOf(records, [ASSIGNMENT_KIND]);
    const catalogPairs = idsOf(records, [CATALOG_COMPANIES_KIND, CATALOG_CATEGORIES_KIND, CATALOG_PRODUCTS_KIND]);
    return {
        companies: new Set([...idsOf(records, [COMPANY_KIND]), ...idsOf(records, [CATALOG_COMPANIES_KIND]).map(after)]),
        catalogs: new Set([...idsOf(records, [CATALOG_KIND]), ...catalogPairs.map(before)]),
        groups: new Set(idsOf(records, [CUSTOMER_GROUP_KIND])),
        customers: new Set(idsOf(records, [CUSTOMER_KIND])),
        sets: new Set([...idsOf(records, [ATTRIBUTE_SET_KIND]), ...assignments.map(before)]),
        attributes: new Set([...idsOf(records, [ATTRIBUTE_KIND]), ...idsOf(records, [ATTRIBUTE_OPTION_KIND]).map(before), ...assignments.map(after)]),
    };
}

const WEBSITE_SCOPE = '@website';

/** Website settings these install records say a datapack wrote, as `<website code>/<path>`: its removal puts them back. */
export function recordedSettings(project: Project, records: readonly InstallRecord[]): string[] {
    const own = resolveInstallTarget(project)?.websiteCode;
    return records.flatMap((record) =>
        record.created
            .filter((o) => o.kind === STORE_CONFIG_KIND && (o.key ?? o.id).endsWith(WEBSITE_SCOPE))
            .map((o) => `${record.target?.websiteCode ?? own}/${(o.key ?? o.id).slice(0, -WEBSITE_SCOPE.length)}`),
    );
}

/** Website settings a record of the project, or its setup guide, says Demo Builder wrote, as `<website code>/<path>`. */
export function settingsKeptBy(project: Project, records: readonly InstallRecord[]): string[] {
    const own = resolveInstallTarget(project)?.websiteCode;
    const fromRecords = recordedSettings(project, records);
    const steps = Object.values(project.appBuilderComponents ?? {}).flatMap((component) => Object.values(component.storePreparation?.steps ?? {}));
    const written = [...steps.flatMap((step) => (step.kind === 'config' ? step.previous : [])), ...(project.commerceConfigChange?.previous ?? [])];
    return [...fromRecords, ...written.filter((row) => row.scope === 'website').map((row) => `${row.scopeCode ?? own}/${row.path}`)];
}

export function installedCounts(records: readonly InstallRecord[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const object of records.flatMap((r) => r.created)) counts[object.kind] = (counts[object.kind] ?? 0) + 1;
    return counts;
}
