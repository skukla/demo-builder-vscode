/**
 * The order reset rule's cases are ONE file, `tests/fixtures/reset-rule-orders.json`, read by this
 * repo's wipe tests (through `tests/helpers/resetRuleOrders.ts`) and by the ERP integration's reset
 * tests, from a byte-for-byte copy at `commerce-erp-integration/test/fixtures/reset-rule-orders.json`.
 *
 * Both repositories pin the SAME fingerprint of that file. Change the table here, and this test
 * fails until the pin below is updated; the ERP integration's own pin fails until its copy is
 * re-synced and its pin updated too. To re-sync:
 *
 *     node scripts/sync-reset-rule-orders.mjs <path to a commerce-erp-integration checkout>
 *
 * copies the file and prints the new fingerprint for both pins.
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { sha256 } from '@/core/utils/sha256';
import { RESET_RULE_CASES } from '../../../../helpers/resetRuleOrders';

const TABLE = path.resolve(__dirname, '../../../../fixtures/reset-rule-orders.json');
const SYNC = path.resolve(__dirname, '../../../../../scripts/sync-reset-rule-orders.mjs');
const COPY = path.join('test', 'fixtures', 'reset-rule-orders.json');

/** The same value is pinned in commerce-erp-integration `test/lib/reset-rule-table.test.js`. */
const PINNED_FINGERPRINT = '90e96d8e0db02132e71b6150b394e3de412247a48ee349062354c1c250ad9bae';

describe('the order reset rule table', () => {
    it('matches the fingerprint the ERP integration pins too', () => {
        const fingerprint = sha256(readFileSync(TABLE, 'utf-8'));
        const verdict =
            fingerprint === PINNED_FINGERPRINT
                ? 'pinned'
                : `tests/fixtures/reset-rule-orders.json changed (sha-256 ${fingerprint}). Run ` +
                  '`node scripts/sync-reset-rule-orders.mjs <commerce-erp-integration checkout>`, ' +
                  'then put the printed fingerprint in PINNED_FINGERPRINT here AND in that ' +
                  "repo's test/lib/reset-rule-table.test.js.";
        expect(verdict).toBe('pinned');
    });

    it("names the owner's cases word for word, the last two as decided on 2026-11-11", () => {
        expect(RESET_RULE_CASES.map((c) => [c.name, c.expected])).toEqual([
            ['(1) pending, nothing invoiced → canceled', 'canceled'],
            ['(2) invoiced, not shipped → refunded, closed', 'refunded'],
            ['(3) invoiced and shipped → refunded, closed', 'refunded'],
            ['(4) invoiced with an open return → refunded, closed, return closed', 'refunded'],
            ['(5) already closed → untouched', 'untouched'],
            ['shipped, not invoiced → invoiced, refunded, closed', 'refunded'],
            ['partly invoiced → invoiced, refunded, closed', 'refunded'],
        ]);
    });
});

describe('scripts/sync-reset-rule-orders.mjs', () => {
    let checkout: string;
    const sync = (target: string) =>
        spawnSync(process.execPath, [SYNC, target], { encoding: 'utf-8' });
    const fakeCheckout = (packageName: string) =>
        writeFileSync(path.join(checkout, 'package.json'), JSON.stringify({ name: packageName }));

    beforeEach(() => {
        checkout = mkdtempSync(path.join(tmpdir(), 'reset-rule-sync-'));
    });
    afterEach(() => rmSync(checkout, { recursive: true, force: true }));

    it('copies the table byte for byte into an ERP integration checkout and prints the pinned fingerprint', () => {
        fakeCheckout('commerce-erp-integration');

        const run = sync(checkout);

        expect(run.status).toBe(0);
        expect(readFileSync(path.join(checkout, COPY)).equals(readFileSync(TABLE))).toBe(true);
        expect(run.stdout).toContain(`Fingerprint: ${PINNED_FINGERPRINT}`);
    });

    it('refuses a folder that is not an ERP integration checkout, and writes nothing', () => {
        fakeCheckout('some-other-package');

        const run = sync(checkout);

        expect(run.status).toBe(1);
        expect(run.stderr).toContain('is not a commerce-erp-integration checkout');
        expect(existsSync(path.join(checkout, COPY))).toBe(false);
    });
});
