/**
 * The `cart_rules` kind (datapack-engine step 11): cart price rules, read off the Data Installer's
 * `CartRuleImportProcessor` and its `cart_rules` configs (import, export, delete).
 *
 * A rule is made on the install target's WEBSITE whatever websites the pack names (the service sets
 * `website_ids` to its session's website, `replaceValueArray(session_website_id)`; the pack's own are
 * another store's ids). Its customer groups are named by code in a pack and turned into this
 * store's ids, both ways (`productLookups`, with the service's aliases); its condition trees are
 * turned both ways too (`ruleConditions.ts`). Commerce's own counter, `times_used`, is never sent
 * and never in pack form, so a demo order using the rule is not taken for an Admin edit.
 *
 * What the store already has, by the rule's exact name, is left alone and not recorded, so removal
 * never takes it: the service instead searched by name and updated the first rule it found,
 * whatever its name, and its removal deleted that one.
 *
 * | Read or write | Endpoint | Field |
 * |---|---|---|
 * | find a rule by name | `GET salesRules/search` (`name` eq) | `items[].rule_id`, `name` (page shape captured, empty) |
 * | its copy | `GET salesRules/{id}` | the rule (not captured) |
 * | make one | `POST salesRules` | `{ rule }`, answers the rule with `rule_id` (not captured) |
 * | update one | `PUT salesRules/{id}` | `{ rule }` with `rule_id` (not captured) |
 * | remove one | `DELETE salesRules/{id}` | Commerce deletes the rule's coupons with it (the service's delete config relies on it; not measured) |
 *
 * Store labels: only the default label (`store_id` 0) travels; a label for one of the source
 * store's views would name a view this store may not have.
 *
 * @module features/data-installer/services/demoBuilderEngine/cartRulesKind
 */

import { z } from 'zod';
import { filterBy } from './b2bReads';
import type { CreatedObject } from './installRecord';
import { deleteIfPresent, eachCopy, type KindContext, ownedId, parseRows, readOrNull, segment } from './kindContext';
import { nameOrId } from './packForm';
import { createOne } from './pendingCreates';
import { type ProductLookups, productLookups } from './productLookups';
import { tryRow } from './refusedRows';
import { conditionsForPack, conditionsForStore, namesSegment } from './ruleConditions';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceRuleCondition, CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

export const CART_RULE_KIND = 'cart_rules';

const conditionSchema: z.ZodType<CommerceRuleCondition> = z.lazy(() =>
    z
        .object({
            condition_type: z.string(),
            conditions: z.array(conditionSchema).optional(),
            aggregator_type: z.string().nullable().optional(),
            operator: z.string().nullable().optional(),
            attribute_name: z.string().nullable().optional(),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        })
        .passthrough(),
);

const ruleRows = z.array(
    z.object({
        rule: z
            .object({
                name: z.string().min(1),
                website_ids: z.array(z.union([z.number(), z.string()])).optional(),
                customer_group_ids: z.array(z.union([z.string(), z.number()])).optional(),
                store_labels: z.array(z.object({ store_id: z.number(), store_label: z.string() }).passthrough()).optional(),
                condition: conditionSchema.optional(),
                action_condition: conditionSchema.optional(),
            })
            .passthrough(),
    }),
);

export type CartRuleRows = z.infer<typeof ruleRows>;
type PackRule = CartRuleRows[number]['rule'];

export const parseCartRuleRows = (records: unknown): CartRuleRows => parseRows(ruleRows, records, 'cart rules');

const defaultLabels = (labels: PackRule['store_labels']) => labels?.filter((l) => l.store_id === 0);

/** The rule with this exact name, or undefined. */
export async function ruleByName(get: CommerceGet, name: string): Promise<CommerceSalesRule | undefined> {
    const found = await readAllPages<CommerceSalesRule>(get, 'salesRules/search', filterBy('name', name));
    return found.find((r) => r.name === name);
}

/** The body Commerce is sent for one pack rule: this store's website, groups and ids. */
async function toCommerceRule(lk: ProductLookups, rule: PackRule, websiteId: number): Promise<CommerceSalesRule> {
    // What only the store a rule came from means: its id, its counter, its websites.
    const { rule_id: _id, times_used: _used, website_ids: _sites, customer_group_ids: groups, condition, action_condition: action, store_labels: labels, ...fields } = rule;
    return {
        ...fields,
        name: rule.name,
        website_ids: [websiteId],
        ...(groups ? { customer_group_ids: await Promise.all(groups.map((g) => lk.groupId(String(g)))) } : {}),
        ...(labels ? { store_labels: defaultLabels(labels) } : {}),
        ...(condition ? { condition: await conditionsForStore(lk, condition) } : {}),
        ...(action ? { action_condition: await conditionsForStore(lk, action) } : {}),
    } as CommerceSalesRule;
}

function websiteOf(ctx: KindContext): number {
    const websiteId = ctx.session.websiteId;
    if (websiteId === undefined) throw new Error("The install target names no website, so the pack's cart rules have nowhere to apply.");
    return websiteId;
}

/** Make each rule the store lacks, on the install target's website; record it by its name. */
export async function installCartRules(ctx: KindContext, rows: CartRuleRows): Promise<void> {
    const websiteId = websiteOf(ctx);
    const lk = productLookups(ctx);
    for (const { rule } of rows) {
        if (ownedId(ctx.session, CART_RULE_KIND, rule.name) !== undefined || ctx.recorder.byKey(CART_RULE_KIND, rule.name)) continue;
        if (await ruleByName(ctx.get, rule.name)) {
            ctx.log(`left cart rule ${rule.name} as it is: the store already has it`);
            continue;
        }
        if (namesSegment(rule.condition) || namesSegment(rule.action_condition)) {
            ctx.log(`cart rule ${rule.name} names a customer segment by another store's id; it is sent as it is, and needs its segment chosen in the Admin`);
        }
        // Step 14 item 3: a row Commerce refuses, or that needs a row skipped, is skipped; the rest go on.
        const made = await tryRow(ctx, { kind: CART_RULE_KIND, key: rule.name }, async () => {
            return createOne(ctx, { kind: CART_RULE_KIND, key: rule.name }, async () => {
                const answer = (await ctx.send('POST', 'salesRules', { rule: await toCommerceRule(lk, rule, websiteId) })) as CommerceSalesRule | null;
                const id = Number(answer?.rule_id);
                if (!Number.isInteger(id)) throw new Error(`Commerce did not answer the new cart rule ${rule.name}'s id.`);
                return { kind: CART_RULE_KIND, id: String(id), key: rule.name };
            });
        });
        if (!made) continue;
        ctx.log(`created cart rule ${rule.name}`);
    }
}

/** Bring a rule this engine made up to the pack's row, on the install target's website. */
export async function updateCartRule(ctx: KindContext, id: string, row: unknown): Promise<void> {
    const [{ rule }] = parseCartRuleRows([row]);
    const body = { ...(await toCommerceRule(productLookups(ctx), rule, websiteOf(ctx))), rule_id: Number(id) };
    await ctx.send('PUT', `salesRules/${segment(id)}`, { rule: body });
}

/** Take back one rule this engine made; Commerce takes its coupons with it. */
export function removeCartRule(send: CommerceSend, id: string): Promise<void> {
    return deleteIfPresent(send, `salesRules/${segment(id)}`);
}

/** A group id as a pack names it: its code, or the id when the store cannot name it. */
async function groupName(lk: ProductLookups, id: number): Promise<string | number> {
    return nameOrId(lk, 'customer group', id, () => lk.groupCode(id));
}

/** A rule as a pack holds it: groups by code, conditions by name, no store's ids or counter. */
export async function rulePackForm(lk: ProductLookups, raw: CommerceSalesRule): Promise<{ rule: PackRule }> {
    const { rule_id: _id, times_used: _used, website_ids: _sites, customer_group_ids: groups, condition, action_condition: action, store_labels: labels, ...fields } = raw;
    return {
        rule: {
            ...fields,
            name: raw.name,
            ...(groups ? { customer_group_ids: await Promise.all(groups.map((g) => groupName(lk, g))) } : {}),
            ...(labels ? { store_labels: defaultLabels(labels) } : {}),
            ...(condition ? { condition: await conditionsForPack(lk, condition) } : {}),
            ...(action ? { action_condition: await conditionsForPack(lk, action) } : {}),
        },
    };
}

/** The store's copy of each recorded rule, in pack form. */
export function readRuleCopies(ctx: KindContext, lk: ProductLookups, objects: readonly CreatedObject[]): Promise<Map<string, unknown>> {
    return eachCopy(objects, async (o) => {
        const raw = await readOrNull<CommerceSalesRule>(ctx.get, `salesRules/${segment(o.id)}`);
        return raw ? rulePackForm(lk, raw) : undefined;
    });
}
