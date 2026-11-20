/**
 * The in-memory store's attributes and attribute sets (`memoryStore.testUtils.ts` is the one entry),
 * on the routes `attributesKind.ts`, `attributeSetsKind.ts`, `productLookups.ts` and `storeCopies.ts`
 * read and write, in their `commerceWire` shapes.
 *
 * Like Commerce: a new attribute gets an id and each of its options a value; a new set copies its
 * skeleton's attributes and groups; deleting an attribute takes it out of every set, and deleting a set
 * takes its groups. Two store attributes are Commerce's own (`url_key`, `description`), one is the
 * store's select (`color`, with "Red"), and the gift card amounts attribute is the captured one.
 */

import {
    type IdSource,
    type StorePart,
    filtersOf,
    matches,
    notFound,
    page,
} from './memoryStore.routes.testUtils';
import type { StoreAttribute } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type {
    CommerceAttributeGroupList,
    CommerceAttributeSetList,
    CommerceSetAttribute,
} from '@/types/commerceWire';
import { GIFTCARD_AMOUNTS_ATTRIBUTE } from '../../../../helpers/commerceSalesRuleFixtures';

type AttributeSet = NonNullable<CommerceAttributeSetList['items']>[number];
type AttributeGroup = NonNullable<CommerceAttributeGroupList['items']>[number];

/** One set as the store holds it: the set, its groups, and the codes of the attributes in it. */
export interface StoredSet {
    set: AttributeSet;
    groups: AttributeGroup[];
    members: Set<string>;
}

/** The store's attributes before any install. */
function storeAttributes(): Map<string, StoreAttribute> {
    const own: StoreAttribute[] = [
        {
            attribute_id: 121,
            attribute_code: 'url_key',
            frontend_input: 'text',
            is_user_defined: false,
        },
        {
            attribute_id: 75,
            attribute_code: 'description',
            frontend_input: 'textarea',
            is_user_defined: false,
        },
        {
            attribute_id: 93,
            attribute_code: 'color',
            frontend_input: 'select',
            is_user_defined: true,
            options: [{ label: 'Red', value: '49' }],
        },
        GIFTCARD_AMOUNTS_ATTRIBUTE,
    ];
    return new Map(own.map((a) => [a.attribute_code ?? '', a]));
}

/** The Default set (4), as a new store has it. */
function defaultSet(): StoredSet {
    return {
        set: { attribute_set_id: 4, attribute_set_name: 'Default', entity_type_id: 4 },
        groups: [
            { attribute_group_id: 7, attribute_group_name: 'General', attribute_set_id: 4 },
            {
                attribute_group_id: 9,
                attribute_group_name: 'Product Details',
                attribute_set_id: 4,
                extension_attributes: { attribute_group_code: 'product-details' },
            },
        ],
        members: new Set(['sku', 'name', 'price', 'url_key', 'description', 'giftcard_amounts']),
    };
}

type AttributeBody = { attribute: StoreAttribute & { options?: Array<{ label: string }> } };
type GroupBody = { group: AttributeGroup & { attribute_set_id: number } };
type SetBody = { attributeSet: AttributeSet; skeletonId: number };
type AssignBody = { attributeSetId: number; attributeGroupId: number; attributeCode: string };

/** The attributes and sets, and their routes. */
export function attributePart(
    ids: IdSource
): StorePart & { attributes: Map<string, StoreAttribute>; sets: Map<number, StoredSet> } {
    const attributes = storeAttributes();
    const sets = new Map<number, StoredSet>([[4, defaultSet()]]);
    const setOf = (path: string, id: string) => sets.get(Number(id)) ?? notFound(path);
    const attributeOf = (path: string, code: string) =>
        attributes.get(decodeURIComponent(code)) ?? notFound(path);
    const membersOf = (stored: StoredSet): CommerceSetAttribute[] =>
        [...stored.members].map((code) => ({
            attribute_code: code,
            attribute_id: attributes.get(code)?.attribute_id,
        }));
    return {
        attributes,
        sets,
        reads: [
            [
                /^products\/attribute-sets\/sets\/list\?/u,
                () => page([...sets.values()].map((s) => s.set)),
            ],
            [
                /^products\/attribute-sets\/groups\/list\?/u,
                (path) =>
                    page(
                        [...sets.values()]
                            .flatMap((s) => s.groups)
                            .filter((g) =>
                                matches(filtersOf(path).get('attribute_set_id'), g.attribute_set_id)
                            )
                    ),
            ],
            [
                /^products\/attribute-sets\/(\d+)\/attributes$/u,
                (path, m) => membersOf(setOf(path, m[1])),
            ],
            [/^products\/attribute-sets\/(\d+)$/u, (path, m) => setOf(path, m[1]).set],
            [
                /^products\/attributes\?/u,
                (path) =>
                    page(
                        [...attributes.values()].filter((a) =>
                            matches(filtersOf(path).get('attribute_id'), a.attribute_id)
                        )
                    ),
            ],
            [
                /^products\/attributes\/([^/?]+)\/options$/u,
                (path, m) => attributeOf(path, m[1]).options ?? [],
            ],
            [/^products\/attributes\/([^/?]+)$/u, (path, m) => attributeOf(path, m[1])],
        ],
        writes: [
            [
                'POST',
                /^products\/attributes$/u,
                (body) => {
                    const { attribute } = body as AttributeBody;
                    const made: StoreAttribute = {
                        ...attribute,
                        attribute_id: ids.next(),
                        is_user_defined: true,
                        options: (attribute.options ?? []).map((o) => ({
                            label: o.label,
                            value: String(ids.next()),
                        })),
                    };
                    attributes.set(attribute.attribute_code ?? '', made);
                    return made;
                },
            ],
            [
                'POST',
                /^products\/attributes\/([^/?]+)\/options$/u,
                (body, m) => {
                    const attribute = attributeOf(m[0], m[1]);
                    const value = String(ids.next());
                    attribute.options = [
                        ...(attribute.options ?? []),
                        { label: (body as { option: { label: string } }).option.label, value },
                    ];
                    return value;
                },
            ],
            [
                'DELETE',
                /^products\/attributes\/([^/?]+)\/options\/([^/?]+)$/u,
                (_body, m) => {
                    const attribute = attributeOf(m[0], m[1]);
                    attribute.options = (attribute.options ?? []).filter(
                        (o) => o.value !== decodeURIComponent(m[2])
                    );
                    return true;
                },
            ],
            [
                'DELETE',
                /^products\/attributes\/([^/?]+)$/u,
                (_body, m) => {
                    const code = decodeURIComponent(m[1]);
                    attributes.delete(code);
                    for (const stored of sets.values()) stored.members.delete(code);
                    return true;
                },
            ],
            [
                'POST',
                /^products\/attribute-sets$/u,
                (body) => {
                    const { attributeSet, skeletonId } = body as SetBody;
                    const skeleton = sets.get(skeletonId) ?? defaultSet();
                    const id = ids.next();
                    const groups = skeleton.groups.map((g) => ({
                        ...g,
                        attribute_group_id: ids.next(),
                        attribute_set_id: id,
                    }));
                    sets.set(id, {
                        set: { ...attributeSet, attribute_set_id: id },
                        groups,
                        members: new Set(skeleton.members),
                    });
                    return { ...attributeSet, attribute_set_id: id };
                },
            ],
            [
                'POST',
                /^products\/attribute-sets\/groups$/u,
                (body) => {
                    const { group } = body as GroupBody;
                    const made: AttributeGroup = { ...group, attribute_group_id: ids.next() };
                    setOf(
                        'products/attribute-sets/groups',
                        String(group.attribute_set_id)
                    ).groups.push(made);
                    return made;
                },
            ],
            [
                'POST',
                /^products\/attribute-sets\/attributes$/u,
                (body) => {
                    const { attributeSetId, attributeCode } = body as AssignBody;
                    setOf('products/attribute-sets/attributes', String(attributeSetId)).members.add(
                        attributeCode
                    );
                    return ids.next();
                },
            ],
            [
                'DELETE',
                /^products\/attribute-sets\/(\d+)\/attributes\/([^/?]+)$/u,
                (_body, m) => {
                    setOf(m[0], m[1]).members.delete(decodeURIComponent(m[2]));
                    return true;
                },
            ],
            [
                'DELETE',
                /^products\/attribute-sets\/(\d+)$/u,
                (_body, m) => {
                    sets.delete(Number(m[1]));
                    return true;
                },
            ],
        ],
    };
}
