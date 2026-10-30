/**
 * The attribute_sets and attribute_assign_to_set kinds: use what the store has, create and
 * record what it lacks, and take back exactly that (DI-5).
 */

import {
    ASSIGNMENT_KIND,
    ATTRIBUTE_SET_KIND,
    installAssignments,
    installAttributeSets,
    parseAssignmentRows,
    parseAttributeSetRows,
    removeAssignment,
    removeAttributeSet,
} from '@/features/data-installer/services/demoBuilderEngine/attributeSetsKind';
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

const SETS_PAGE = 'products/attribute-sets/sets/list?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100';
const groupsOf = (setId: number) =>
    'products/attribute-sets/groups/list?searchCriteria[filter_groups][0][filters][0][field]=attribute_set_id' +
    `&searchCriteria[filter_groups][0][filters][0][value]=${setId}`;
const STORE_SETS = {
    items: [{ attribute_set_id: 4, attribute_set_name: 'Default' }],
    total_count: 1,
};

/** Commerce's answers to the creates: set 12, group 80. */
function creates(call: SentCall): unknown {
    if (call.path === 'products/attribute-sets') return { attribute_set_id: 12 };
    if (call.path === 'products/attribute-sets/groups') return { attribute_group_id: 80 };
    return true;
}

describe('installAttributeSets', () => {
    it('creates a set the store lacks from the Default skeleton, with its own group, and records the set', async () => {
        const ctx = await fakeContext({ [SETS_PAGE]: STORE_SETS }, creates);

        await installAttributeSets(ctx, parseAttributeSetRows([{ attributeSet: { attribute_set_name: 'Coolers' } }]));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'products/attribute-sets',
                body: { attributeSet: { entity_type_id: 4, sort_order: 0, attribute_set_name: 'Coolers' }, skeletonId: 4 },
            },
            {
                method: 'POST',
                path: 'products/attribute-sets/groups',
                body: {
                    group: {
                        attribute_group_name: 'Coolers',
                        attribute_set_id: 12,
                        extension_attributes: { attribute_group_code: 'coolers', sort_order: '100' },
                    },
                },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: ATTRIBUTE_SET_KIND, id: '12' }]);
        expect(ctx.session.setIds.get('Coolers')).toBe(12);
        expect(ctx.session.groupIds.get('Coolers')).toBe(80);
    });

    it('uses a set the store already has and records nothing', async () => {
        const ctx = await fakeContext({
            [SETS_PAGE]: STORE_SETS,
            [groupsOf(4)]: { items: [{ attribute_group_id: 7, attribute_group_name: 'General' }] },
        });

        await installAttributeSets(ctx, parseAttributeSetRows([{ attributeSet: { attribute_set_name: 'Default' } }]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
        expect(ctx.session.groupIds.get('Default')).toBe(7);
    });

    it('fails when Commerce answers no set id', async () => {
        const ctx = await fakeContext({ [SETS_PAGE]: STORE_SETS }, () => ({}));

        await expect(
            installAttributeSets(ctx, parseAttributeSetRows([{ attributeSet: { attribute_set_name: 'Coolers' } }])),
        ).rejects.toThrow('Commerce made no attribute set Coolers.');
    });

    it('on a re-run, makes the group a set it created last time is missing', async () => {
        const ctx = await fakeContext(
            {
                [SETS_PAGE]: { items: [...STORE_SETS.items, { attribute_set_id: 12, attribute_set_name: 'Coolers' }] },
                [groupsOf(12)]: { items: [] },
            },
            creates,
        );
        await ctx.recorder.record({ kind: ATTRIBUTE_SET_KIND, id: '12' });

        await installAttributeSets(ctx, parseAttributeSetRows([{ attributeSet: { attribute_set_name: 'Coolers' } }]));

        expect(ctx.sent.map((c) => c.path)).toEqual(['products/attribute-sets/groups']);
    });
});

describe('installAssignments', () => {
    const ROW = { attributeSetId: 'Default', attributeCode: 'bodea_fabric', sortOrder: 10 };

    it('adds an attribute to its set, in the house group, and records it', async () => {
        const ctx = await fakeContext({
            [SETS_PAGE]: STORE_SETS,
            'products/attribute-sets/4/attributes': [{ attribute_code: 'sku' }],
            [groupsOf(4)]: {
                items: [
                    { attribute_group_id: 7, attribute_group_name: 'General' },
                    { attribute_group_id: 9, extension_attributes: { attribute_group_code: 'product-details' } },
                ],
            },
        });

        await installAssignments(ctx, parseAssignmentRows([ROW]));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'products/attribute-sets/attributes',
                body: { attributeSetId: 4, attributeGroupId: 9, attributeCode: 'bodea_fabric', sortOrder: 10 },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: ASSIGNMENT_KIND, id: '4/bodea_fabric' }]);
    });

    it('puts an attribute in the group the set kind made', async () => {
        const ctx = await fakeContext({
            [SETS_PAGE]: STORE_SETS,
            'products/attribute-sets/12/attributes': [],
        });
        ctx.session.setIds.set('Coolers', 12);
        ctx.session.groupIds.set('Coolers', 80);

        await installAssignments(ctx, parseAssignmentRows([{ ...ROW, attributeSetId: 'Coolers' }]));

        expect(ctx.sent[0].body).toMatchObject({ attributeSetId: 12, attributeGroupId: 80 });
    });

    it('leaves an attribute already in its set alone', async () => {
        const ctx = await fakeContext({
            [SETS_PAGE]: STORE_SETS,
            'products/attribute-sets/4/attributes': [{ attribute_code: 'bodea_fabric' }],
        });

        await installAssignments(ctx, parseAssignmentRows([ROW]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    // Step 14 item 3: skipped and named, and the rest of the pack goes on.
    it('skips an assignment to a set the store does not have, naming it', async () => {
        const ctx = await fakeContext({ [SETS_PAGE]: STORE_SETS });

        await installAssignments(ctx, parseAssignmentRows([{ ...ROW, attributeSetId: 'Nope' }]));

        expect(ctx.session.skipped).toEqual([{ kind: 'attribute_assign_to_set', key: `Nope/${ROW.attributeCode}`, reason: 'The store has no attribute set named Nope.' }]);
        expect(ctx.sent).toStrictEqual([]);
    });
});

describe('removal', () => {
    it('deletes a set it created', async () => {
        const ctx = await fakeContext();

        await removeAttributeSet(ctx.send, '12');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'products/attribute-sets/12', body: undefined }]);
    });

    it('takes an attribute it added back out of its set', async () => {
        const ctx = await fakeContext();

        await removeAssignment(ctx.send, '4/bodea_fabric');

        expect(ctx.sent).toEqual([
            { method: 'DELETE', path: 'products/attribute-sets/4/attributes/bodea_fabric', body: undefined },
        ]);
    });
});

describe('parsing', () => {
    it('refuses an assignment with no set', () => {
        expect(() => parseAssignmentRows([{ attributeCode: 'x' }])).toThrow(/attribute assignments/);
    });
});
