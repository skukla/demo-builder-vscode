#!/usr/bin/env node
/**
 * Copy the order reset rule's cases into an ERP integration checkout, and print the fingerprint
 * both repositories pin.
 *
 *   node scripts/sync-reset-rule-orders.mjs <path to a commerce-erp-integration checkout>
 *
 * The cases live in ONE file, tests/fixtures/reset-rule-orders.json (this repo). The ERP
 * integration's reset tests read a byte-for-byte copy at test/fixtures/reset-rule-orders.json,
 * and each repository pins the file's sha-256: here in
 * tests/features/data-installer/services/demoDataWipe/resetRuleTable.test.ts, there in
 * test/lib/reset-rule-table.test.js. After changing the table, run this, then put the printed
 * fingerprint into both pins. Writes one file in the given checkout; no network.
 *
 * Not a quality instrument (it measures nothing), so it has no row in tests/sop/toolingRegistry.ts.
 */

import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ERP_PACKAGE = 'commerce-erp-integration';
const RELATIVE = path.join('test', 'fixtures', 'reset-rule-orders.json');
const SOURCE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'tests',
    'fixtures',
    'reset-rule-orders.json',
);

function fail(message) {
    console.error(`sync-reset-rule-orders: ${message}`);
    process.exit(1);
}

/** The checkout's package name, or undefined when it has no package.json. */
function packageNameOf(checkout) {
    const manifest = path.join(checkout, 'package.json');
    if (!existsSync(manifest)) {
        return undefined;
    }
    return JSON.parse(readFileSync(manifest, 'utf-8')).name;
}

const checkout = process.argv[2];
if (!checkout) {
    fail('usage: node scripts/sync-reset-rule-orders.mjs <path to a commerce-erp-integration checkout>');
}
const name = packageNameOf(checkout);
if (name !== ERP_PACKAGE) {
    fail(`${checkout} is not a ${ERP_PACKAGE} checkout (its package.json names ${name ?? 'nothing'})`);
}

const target = path.join(checkout, RELATIVE);
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(SOURCE, target);
const fingerprint = createHash('sha256').update(readFileSync(target)).digest('hex');
console.log(`Copied to ${target}`);
console.log(`Fingerprint: ${fingerprint}`);
console.log(
    'Pin it in both: demoDataWipe/resetRuleTable.test.ts here, test/lib/reset-rule-table.test.js there.',
);
