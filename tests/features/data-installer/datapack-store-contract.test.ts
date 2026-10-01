/**
 * The datapack store answers the Data Installer's database API — proven against THIS
 * extension's own parsers, not asserted.
 *
 * The fixtures under `fixtures/datapack-store/` are the store's LIVE answers, captured
 * 2026-10-01 from the scratch deployment of `accs-discovery-service`'s `datapack-store`
 * package (`.rptc/plans/datapack-store/step-02b.md`): one pack, two data types, read
 * through the four calls `dataInstallerClient` makes. The owner's address was replaced
 * by a stand-in and `duration` pinned; nothing else was edited. If these parse into the
 * same shapes the Data Installer's answers parse into, the client reads our store with
 * only the base URL changed — which is the claim step 02b makes.
 *
 * Contract tier (ADR-016): fixtures captured from a live response, read by the real
 * parsers. Re-capture with the step-02 round-trip script when the store's answers change.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
    parseDatapackDetail,
    parseDatapackList,
    parseDataItem,
    parseDataItemInventory,
} from '@/features/data-installer/services/dataInstallerParsers';

const FIXTURES = join(__dirname, 'fixtures', 'datapack-store');
const load = (name: string): unknown =>
    JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));

describe('the extension reads the datapack store with its Data Installer parsers', () => {
    it('find-datapacks → the catalog row the Datapacks screen renders', () => {
        const page = parseDatapackList(load('find-datapacks'));

        expect(page.count).toBe(1);
        expect(page.total).toBeUndefined(); // the Data Installer reports none either
        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({
            id: { name: 'fixture-capture', version: 'v1' },
            displayName: 'Fixture capture',
            owner: 'sc@example.com',
            shared: true,
            dataTypes: ['categories', 'customer_groups'],
        });
        // A list row carries no description — the Data Installer's own rows do not,
        // and the store mirrors his row, so the parser's optional field stays absent.
        expect(page.items[0].description).toBeUndefined();
    });

    it('get-datapack-metadata → the detail the flyout renders, with the service duration', () => {
        const detail = parseDatapackDetail(load('get-datapack-metadata'));

        expect(detail).toMatchObject({
            id: { name: 'fixture-capture', version: 'v1' },
            displayName: 'Fixture capture',
            shared: true,
            dataTypes: ['categories', 'customer_groups'],
            durationMs: 1,
        });
    });

    it('get-data-item → the rows, parsed out of the wire string', () => {
        const item = parseDataItem(load('get-data-item'), 'categories');

        expect(item).toMatchObject({ dataType: 'categories', count: 1, includeContent: true });
        expect(item.records).toEqual([{ category: { id: 1, name: 'Signs and Labels' } }]);
        expect(item.rawData).toBeUndefined();
    });

    it('batch-get-data-items → which requested types the pack holds, from results[] not items[]', () => {
        const inventory = parseDataItemInventory(load('batch-get-data-items'));

        expect(inventory).toEqual({
            present: ['categories', 'customer_groups'],
            missing: ['products'],
            presentCount: 2,
            missingCount: 1,
            requestedCount: 3,
        });
    });

    // Control: the fixtures are the store's answers, not hand-written. A hand-written
    // fixture would not carry the store's own `_id` and `duration` fields.
    it('control: the fixtures carry the fields only a live answer has', () => {
        const list = load('find-datapacks') as {
            datapacks: Array<Record<string, unknown>>;
            duration: number;
        };
        expect(typeof list.datapacks[0]._id).toBe('string');
        expect(list.duration).toBe(1);
    });
});
