/**
 * The example orders of the ONE reset rule for orders (owner, 2026-10-30; changed 2026-11-11), read
 * from `tests/fixtures/reset-rule-orders.json` and typed here to the real wire shapes.
 *
 * That file is the only copy of the cases. The ERP integration's reset tests read a byte-for-byte
 * copy of it (`commerce-erp-integration/test/fixtures/reset-rule-orders.json`), and both
 * repositories pin the file's sha-256 (`resetRuleTable.test.ts` here). Edit the JSON, then run
 * `node scripts/sync-reset-rule-orders.mjs <commerce-erp-integration checkout>` and put the
 * fingerprint it prints into both pins.
 *
 * This file is the gate on the JSON's shape: `npm run typecheck:tests` rejects a case field, order
 * field or order-line field the real types do not have, and a wrong value type. An outcome outside
 * `ResetRuleOutcome` fails when the table loads.
 *
 * The rule, in plain words, is in `.rptc/plans/datapack-engine/step-10-wipe.md` ("One reset rule"),
 * as changed by `.rptc/plans/erp-order-close/overview.md`. None of these bodies is captured from a
 * live store.
 */

import table from '../fixtures/reset-rule-orders.json';
import type { CommerceOrder, CommerceOrderItem, CommerceReturn } from '@/types/commerceWire';

/** What the rule does to the order. */
export type ResetRuleOutcome = 'canceled' | 'refunded' | 'untouched';

export interface ResetRuleCase {
    name: string;
    order: CommerceOrder;
    returns: CommerceReturn[];
    expected: ResetRuleOutcome;
    /** The return the rule closes, by id. */
    closesReturn?: number;
    /** Something not yet invoiced: the rule invoices it all before refunding everything invoiced. */
    invoices?: boolean;
}

/** Every key of every member of `T` (a JSON array's element type is a union). */
type KeysOf<T> = T extends unknown ? keyof T : never;
/** `true` only when `T` has no key `Real` lacks; otherwise the error names the stray key. */
type NoStrayKeys<T, Real> = [Exclude<KeysOf<T>, keyof Real>] extends [never]
    ? true
    : `not a field of the real type: ${Exclude<KeysOf<T>, keyof Real> & string}`;

type JsonCase = (typeof table.cases)[number];
type JsonOrder = JsonCase['order'];
type JsonLine = JsonOrder['items'][number];

// Assignment alone would let a misspelled field through; these reject it by name.
true satisfies NoStrayKeys<JsonCase, ResetRuleCase>;
true satisfies NoStrayKeys<JsonOrder, CommerceOrder>;
true satisfies NoStrayKeys<JsonLine, CommerceOrderItem>;

const OUTCOMES: readonly ResetRuleOutcome[] = ['canceled', 'refunded', 'untouched'];

function outcomeOf(name: string, value: string): ResetRuleOutcome {
    const outcome = OUTCOMES.find((known) => known === value);
    if (!outcome) {
        const known = OUTCOMES.join(', ');
        throw new Error(`reset-rule-orders.json: case "${name}" expects "${value}", not one of ${known}`);
    }
    return outcome;
}

export const RESET_RULE_CASES: ResetRuleCase[] = table.cases.map(
    (entry): ResetRuleCase => ({ ...entry, expected: outcomeOf(entry.name, entry.expected) }),
);
