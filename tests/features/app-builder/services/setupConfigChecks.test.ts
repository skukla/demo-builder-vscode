/**
 * The setup checks that read Commerce's own settings (AB-26x): the two custom order statuses,
 * Catalog Price Scope, and Payment on Account on the project's website. Driven through
 * `runSetupCheck`, the door the handler uses, and the read's PATHS are asserted, since a
 * mocked read answers the same whatever it is asked.
 *
 * The shapes are copied from a live ACCS sandbox read on 2026-10-01: `GET order-statuses`
 * (one row per status and state, trimmed to the rows that matter here) and
 * `GET system/config` with a path filter (a REST-client page-size note precedes the body).
 */

import { runSetupCheck } from '@/features/app-builder/services/setupChecks';

const PENDING = { status: 'pending', label: 'Pending', state: 'new', default: true, visible_on_front: true };
const PROCESSING = { status: 'processing', label: 'Processing', state: 'processing', default: true, visible_on_front: true };
const CONFIRMED = { status: 'erp_confirmed', label: 'Confirmed in ERP', state: 'new', default: false, visible_on_front: true };
const HELD_NEW = { status: 'partially_held', label: 'Partially Held', state: 'new', default: false, visible_on_front: false };
const HELD_PROCESSING = { ...HELD_NEW, state: 'processing' };

type Read = (path: string) => Promise<string>;
const statuses = (rows: object[]): jest.Mock<Promise<string>, [string]> =>
    jest.fn(async (_path: string) => JSON.stringify(rows));

const FILTER = 'searchCriteria[filterGroups][0][filters][0]';
const configAt = (setting: string, website?: string): string =>
    `system/config?${website ? `scope=websites&scopeCode=${website}&` : ''}${FILTER}[field]=path&${FILTER}[value]=${setting}`;

/** A config read answering each path's stored value, or no item when it has none. */
function config(values: Record<string, string>): jest.Mock<Promise<string>, [string]> {
    return jest.fn(async (path: string) => {
        const value = values[path];
        const items = value === undefined ? [] : [{ path: path.split('[value]=')[1], value, scope: 'default' }];
        return `[pageSize 20 applied; pass searchCriteria[pageSize] to change it]\n${JSON.stringify({ items, total_count: items.length })}`;
    });
}

const BUSY = 'Error: Commerce REST answered HTTP 503. busy';
const COULD_NOT = { note: 'Could not check: Commerce REST answered HTTP 503. busy' };

describe('erp-confirmed-status', () => {
    const check = (read: Read) => runSetupCheck('erp-confirmed-status', read);

    it('reads the order statuses', async () => {
        const read = statuses([PENDING, CONFIRMED]);
        await check(read);
        expect(read).toHaveBeenCalledWith('order-statuses');
    });

    it('is done when Confirmed in ERP is a Pending status that is not the default', async () => {
        expect(await check(statuses([PENDING, CONFIRMED, PROCESSING]))).toStrictEqual({
            done: true,
            note: 'Confirmed in ERP (erp_confirmed) is a Pending status.',
        });
    });

    it('is not done when Commerce has no such status', async () => {
        expect(await check(statuses([PENDING, PROCESSING]))).toStrictEqual({
            done: false,
            note: 'Commerce has no erp_confirmed order status.',
        });
    });

    it('is not done when the status exists but is not assigned to Pending', async () => {
        expect(await check(statuses([{ ...CONFIRMED, state: 'processing' }]))).toStrictEqual({
            done: false,
            note: 'Confirmed in ERP (erp_confirmed) is not assigned to Pending.',
        });
    });

    it("is not done when it was made Pending's default", async () => {
        expect(await check(statuses([{ ...CONFIRMED, default: true }]))).toStrictEqual({
            done: false,
            note: 'Confirmed in ERP (erp_confirmed) is the default status of Pending; it must not be.',
        });
    });

    it('cannot tell when the read failed, and passes on why', async () => {
        expect(await check(jest.fn(async () => BUSY))).toStrictEqual(COULD_NOT);
    });
});

describe('partially-held-status', () => {
    const check = (read: Read) => runSetupCheck('partially-held-status', read);

    it('is done when Partially Held is on both Pending and Processing', async () => {
        expect(await check(statuses([PENDING, HELD_NEW, HELD_PROCESSING]))).toStrictEqual({
            done: true,
            note: 'Partially Held (partially_held) is a Pending and Processing status.',
        });
    });

    it('names the state it is missing', async () => {
        expect(await check(statuses([HELD_NEW]))).toStrictEqual({
            done: false,
            note: 'Partially Held (partially_held) is not assigned to Processing.',
        });
    });
});

describe('price-scope-website', () => {
    const check = (read: Read) => runSetupCheck('price-scope-website', read);
    const PATH = configAt('catalog/price/scope');

    it('reads the setting at the default scope, the only one it has', async () => {
        const read = config({ [PATH]: '1' });
        await check(read);
        expect(read).toHaveBeenCalledWith(PATH);
    });

    it('is done at Website (1)', async () => {
        expect(await check(config({ [PATH]: '1' }))).toStrictEqual({
            done: true,
            note: 'Catalog Price Scope is Website.',
        });
    });

    it('is not done at Global (0), or when never saved, which is Global', async () => {
        const notDone = { done: false, note: 'Catalog Price Scope is Global; it must be Website.' };
        expect(await check(config({ [PATH]: '0' }))).toStrictEqual(notDone);
        expect(await check(config({}))).toStrictEqual(notDone);
    });

    it('cannot tell when the read failed', async () => {
        expect(await check(jest.fn(async () => BUSY))).toStrictEqual(COULD_NOT);
    });
});

describe('payment-on-account-enabled', () => {
    const SETTING = 'payment/companycredit/active';
    const check = (read: Read, websiteCode?: string) =>
        runSetupCheck('payment-on-account-enabled', read, { websiteCode });

    it("reads the project's website", async () => {
        const read = config({ [configAt(SETTING, 'acme')]: '1' });
        await check(read, 'acme');
        expect(read).toHaveBeenCalledWith(configAt(SETTING, 'acme'));
    });

    it('is done when on for the website, not done when off, and names the website as the Admin does', async () => {
        const named = (value: string) => {
            const read = config({ [configAt(SETTING, 'acme')]: value });
            return jest.fn(async (path: string) =>
                // GET store/websites, shaped as the sandbox answered it on 2026-10-01.
                path === 'store/websites' ? JSON.stringify([{ id: 5, code: 'acme', name: 'Acme Website' }]) : read(path),
            );
        };
        expect(await check(named('1'), 'acme')).toStrictEqual({ done: true, note: 'Payment on Account is on for Acme Website.' });
        expect(await check(named('0'), 'acme')).toStrictEqual({ done: false, note: 'Payment on Account is off for Acme Website.' });
    });

    it('names the website by its code when the website list cannot be read', async () => {
        expect((await check(config({ [configAt(SETTING, 'acme')]: '1' }), 'acme')).note).toBe(
            'Payment on Account is on for acme.',
        );
    });

    it('uses the default when the website stores no value of its own', async () => {
        const read = config({ [configAt(SETTING)]: '1' });
        expect((await check(read, 'acme')).done).toBe(true);
        expect(read).toHaveBeenCalledWith(configAt(SETTING));
    });

    it('cannot tell without a website, and reads nothing', async () => {
        const read = config({});
        expect(await check(read)).toStrictEqual({
            note: 'Could not check: the project names no Commerce website.',
        });
        expect(read).not.toHaveBeenCalled();
    });

    it('cannot tell when the read failed', async () => {
        expect(await check(jest.fn(async () => BUSY), 'acme')).toStrictEqual(COULD_NOT);
    });
});

// Read live on Justrite 2026-10-02: sales/magento_rma/enabled had no value at the default or on
// the website (Commerce's default is No), so a buyer could not ask for a return on the
// storefront; staff could still enter one in the Admin.
describe('storefront-returns-enabled', () => {
    const SETTING = 'sales/magento_rma/enabled';
    const check = (read: Read, websiteCode?: string) =>
        runSetupCheck('storefront-returns-enabled', read, { websiteCode });

    it("is done when Enable RMA on Storefront is Yes for the project's website, and names it", async () => {
        const named = (value: string) => {
            const read = config({ [configAt(SETTING, 'acme')]: value });
            return jest.fn(async (path: string) =>
                path === 'store/websites' ? JSON.stringify([{ id: 5, code: 'acme', name: 'Acme Website' }]) : read(path),
            );
        };
        expect(await check(named('1'), 'acme')).toStrictEqual({
            done: true,
            note: 'Returns are on for the Acme Website storefront.',
        });
        expect(await check(named('0'), 'acme')).toStrictEqual({
            done: false,
            note: 'Returns are off for the Acme Website storefront.',
        });
    });

    it('uses the default when the website stores no value, and an unset default is off', async () => {
        const on = config({ [configAt(SETTING)]: '1' });
        expect((await check(on, 'acme')).done).toBe(true);
        expect(on).toHaveBeenCalledWith(configAt(SETTING, 'acme'));
        expect((await check(config({}), 'acme')).done).toBe(false);
    });

    it('cannot tell without a website, or when the read failed', async () => {
        expect(await check(config({}))).toStrictEqual({
            note: 'Could not check: the project names no Commerce website.',
        });
        expect(await check(jest.fn(async () => BUSY), 'acme')).toStrictEqual(COULD_NOT);
    });
});
