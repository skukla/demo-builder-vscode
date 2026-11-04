/**
 * "Clear demo data": the stores to choose from arrive first with nothing ticked; ticking a store
 * (or a website, which ticks all of its stores) asks what clearing them would do, and Clear hands
 * the ticked stores and that list's token to the screen. A store another project claims is locked.
 * Every request is asserted by its payload, because the handler decides on those fields.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ClearDemoDataModal } from '@/features/data-installer/ui/components/ClearDemoDataModal';
import { previewLines } from '@/features/data-installer/ui/clearDemoDataWords';
import type { DemoDataCheck, WipeChoiceWebsite, WipePreview } from '@/types/demoDataWipe';

const mockRequest = webviewClient.request as jest.Mock;

const CLAIMED = "The store justrite_store (website justrite) is also JustRite's own store (project JustRite). Clear it from that project, if at all.";

const CHOICES: WipeChoiceWebsite[] = [
    { code: 'justrite', name: 'JustRite', stores: [{ code: 'justrite_store', name: 'JustRite Store', views: ['JustRite US'], ticked: false, claimedBy: CLAIMED }] },
    {
        code: 'bodea',
        name: 'Bodea',
        stores: [
            { code: 'bodea_store', name: 'Bodea Store', views: ['Bodea English'], ticked: false },
            { code: 'bodea_outlet', name: 'Bodea Outlet', views: ['Bodea Outlet English', 'Bodea Outlet French'], ticked: false },
        ],
    },
];

const named = (names: string[]) => ({ count: names.length, names });

const PREVIEW: WipePreview = {
    stores: [{ websiteCode: 'bodea', websiteName: 'Bodea', storeCode: 'bodea_store', storeName: 'Bodea Store' }],
    remove: { products: named(['BD-RACK', 'BD-CHAIR']), categories: named(['Racks']), customers: named(['bd.store@example.com']), cartRules: named([]), companies: named([]), catalogs: named([]), customerGroups: named([]), attributeSets: named([]), attributes: named([]) },
    settings: named([]),
    takenOff: named(['BD-ALSO-ON-MAIN']),
    rulesTakenOff: named([]),
    orders: { cancel: named(['000000701']), refund: named(['000000702', '000000703']), leftOpen: named(['000000706']), returns: named(['R40']) },
    left: [{ kind: 'products', ...named(['BD-NO-CATEGORY']), why: "which demo they belong to can't be told" }],
    installed: { products: 1 },
    total: 9,
    token: 'tok-1',
    never: 'Never touched: what Demo Builder installed.',
};

function withStore(answer: (stores: unknown[]) => DemoDataCheck = (stores) => (stores.length ? { choices: CHOICES, preview: PREVIEW } : { choices: CHOICES })): void {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string, payload: { stores: unknown[] }) =>
        type === 'check-demo-data' ? { success: true, data: answer(payload.stores) } : { success: true, data: null },
    );
}

const checks = () => mockRequest.mock.calls.filter((c) => c[0] === 'check-demo-data').map((c) => c[1]);

async function openModal() {
    const onClear = jest.fn();
    const onClose = jest.fn();
    render(<ClearDemoDataModal onClose={onClose} onClear={onClear} />);
    await settle();
    return { onClear, onClose };
}

/** Tick, then let the check's pause pass and its answer land. */
async function tick(name: RegExp) {
    await press(screen.getByRole('checkbox', { name }));
    await act(async () => {
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    });
    await settle();
}

beforeEach(() => withStore());

it('asks for the stores alone first, with nothing ticked and nothing to clear', async () => {
    await openModal();

    expect(checks()).toEqual([{ stores: [] }]);
    expect(screen.getByText(/Select a store to preview what will be cleared/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});

it("lists each store's views under its website, and locks a store another project claims, naming it", async () => {
    await openModal();

    expect(screen.getByText('bodea_outlet. Views: Bodea Outlet English, Bodea Outlet French')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /JustRite Store/ })).toBeDisabled();
    expect(screen.getByText(CLAIMED)).toBeInTheDocument();
});

it('asks about the ticked store, and lists what clearing it would do, orders included', async () => {
    await openModal();

    await tick(/Bodea Store/);

    expect(checks()[1]).toEqual({ stores: [{ websiteCode: 'bodea', storeCode: 'bodea_store' }] });
    expect(screen.getByText('2 to remove, 1 taken off the chosen websites')).toBeInTheDocument();
    expect(screen.getByText('1 to cancel, 2 to refund, 1 to leave open with a note, 1 return to close')).toBeInTheDocument();
    expect(screen.getByText("1 product (BD-NO-CATEGORY): which demo they belong to can't be told")).toBeInTheDocument();
});

it("says it is permanent in the opening sentence, not in a footnote under the list", async () => {
    await openModal();

    expect(screen.getByText(/Clearing permanently removes what only they use/)).toBeInTheDocument();

    await tick(/Bodea Store/);

    expect(screen.queryByText(/can't be undone/)).not.toBeInTheDocument();
    expect(screen.getByText('Never touched: what Demo Builder installed.')).toBeInTheDocument();
});

it('puts no label over the list: the list says what it is', async () => {
    await openModal();
    await tick(/Bodea Store/);

    expect(screen.getByText('Stores')).toBeInTheDocument();
    expect(screen.queryByText('What clearing does')).not.toBeInTheDocument();
});

describe('previewLines, the kinds only the chosen stores use', () => {
    const preview: WipePreview = {
        ...PREVIEW,
        remove: {
            ...PREVIEW.remove,
            companies: named(['Altura', 'Bravo']),
            catalogs: named(['Gold']),
            customerGroups: named(['Loose', 'Looser']),
            attributeSets: named(['Wipers']),
            attributes: named(['wiper_size', 'wiper_kind']),
        },
        settings: { ...named([]), count: 1012 },
        left: [
            { kind: 'shared catalogs', count: 5, names: ['Silver', 'Bronze', 'Tin'], why: 'a customer that stays uses them' },
            { kind: 'companies', ...named(['Altura', 'Bravo']), why: 'a customer in them is on a website not chosen' },
            { kind: 'attributes', ...named(['cs_format']), why: 'an attribute set that stays holds them' },
            { kind: 'settings', count: 1, names: [], why: 'they have no default value to go back to' },
        ],
    };

    it('says what goes, each kind on its own line, a catalog with its group', () => {
        const lines = previewLines(preview);

        expect(lines).toContainEqual({ label: 'Companies', value: '2 to remove, with their customers' });
        expect(lines).toContainEqual({ label: 'Shared Catalogs', value: '1 to remove, with its customer group' });
        expect(lines).toContainEqual({ label: 'Customer Groups', value: '2 to remove' });
        expect(lines).toContainEqual({ label: 'Attribute Sets', value: '1 to remove' });
        expect(lines).toContainEqual({ label: 'Attributes', value: '2 to remove' });
    });

    it('says plainly what Commerce cannot do about a website setting, digits with separators', () => {
        expect(previewLines(preview)).toContainEqual({
            label: 'Website Settings',
            value: "1,012 set to the default's value. Commerce can't clear a website's own value, so a later change to the default won't reach them.",
        });
    });

    it('names what stays and why, beside each kind', () => {
        const lines = previewLines(preview).filter((l) => l.label === 'Not Removed').map((l) => l.value);

        expect(lines).toEqual([
            '5 shared catalogs (Silver, Bronze, Tin and 2 more): a customer that stays uses them',
            '2 companies (Altura and Bravo): a customer in them is on a website not chosen',
            '1 attribute (cs_format): an attribute set that stays holds them',
            '1 setting: they have no default value to go back to',
        ]);
    });

    it('uses no middle dot anywhere it says these', () => {
        expect(previewLines(preview).every((l) => !l.value.includes('\u00B7'))).toBe(true);
    });

    it('lists none of them when none goes', () => {
        const labels = previewLines({ ...PREVIEW, left: [] }).map((l) => l.label);

        expect(labels).not.toContain('Companies');
        expect(labels).not.toContain('Website Settings');
    });
});

it('says what stays when nothing goes, rather than that the stores hold nothing, and offers no clearing', async () => {
    const left = [{ kind: 'companies' as const, ...named(['Altura']), why: 'a customer in them is on a website not chosen' }];
    const nothingGoes = { ...PREVIEW, total: 0, left, installed: {} };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview: nothingGoes } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText('1 company (Altura): a customer in them is on a website not chosen')).toBeInTheDocument();
    expect(screen.queryByText('These stores hold nothing Demo Builder did not install.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});

it('says the stores hold nothing only when nothing goes and nothing stays', async () => {
    const empty = { ...PREVIEW, total: 0, left: [], installed: {} };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview: empty } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText('These stores hold nothing Demo Builder did not install.')).toBeInTheDocument();
});

it('writes large counts with separators, in the list and on the button', async () => {
    const big = { ...named([]), count: 1284 };
    const preview = {
        ...PREVIEW,
        remove: { ...PREVIEW.remove, products: big, categories: { ...named([]), count: 1012 }, customers: { ...named([]), count: 2500 }, cartRules: { ...named([]), count: 3000 } },
        takenOff: { ...named([]), count: 1100 },
        rulesTakenOff: { ...named([]), count: 4000 },
        orders: { cancel: { ...named([]), count: 5000 }, refund: { ...named([]), count: 6000 }, leftOpen: { ...named([]), count: 7000 }, returns: { ...named([]), count: 8000 } },
        left: [{ kind: 'products' as const, ...named([]), count: 9000, why: 'x' }],
        installed: { products: 1500 },
        total: 1311,
    };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview } : { choices: CHOICES }));

    expect(previewLines(preview)).toEqual([
        { label: 'Products', value: '1,284 to remove, 1,100 taken off the chosen websites' },
        { label: 'Categories', value: '1,012 to remove' },
        { label: 'Customers', value: '2,500 to remove' },
        { label: 'Cart Rules', value: '3,000 to remove, with their coupons, 4,000 taken off the chosen websites' },
        { label: 'Orders', value: '5,000 to cancel, 6,000 to refund, 7,000 to leave open with a note, 8,000 returns to close' },
        { label: 'Not Removed', value: '9,000 products: x' },
        { label: 'Installed', value: '1,500 products, which removing its datapack takes' },
    ]);
    await openModal();
    await tick(/Bodea Store/);
    expect(screen.getByRole('button', { name: 'Clear 1,311 Items' })).toBeInTheDocument();
});

it('shows a re-check as a spinner where the answer lands, with no words, and keeps the stores', async () => {
    await openModal();

    await press(screen.getByRole('checkbox', { name: /Bodea Store/ }));

    expect(screen.getByRole('progressbar', { name: 'Reading demo data' })).toBeInTheDocument();
    expect(screen.queryByText('Reading demo data')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Bodea Store/ })).toBeInTheDocument();
    await act(async () => {
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    });
    await settle();
});

it('waits with no words while it reads the stores', async () => {
    mockRequest.mockReset();
    mockRequest.mockImplementation(() => new Promise(() => undefined));

    await openModal();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Reading demo data')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

it('lists the cart rules it would clear on their own line, with what is only taken off (step 11)', () => {
    const lines = previewLines({ ...PREVIEW, remove: { ...PREVIEW.remove, cartRules: named(['ZZ Ten Off']) }, rulesTakenOff: named(['ZZ Shared']) });

    expect(lines).toContainEqual({ label: 'Cart Rules', value: '1 to remove, with their coupons, 1 taken off the chosen websites' });
    expect(previewLines(PREVIEW).some((l) => l.label === 'Cart Rules')).toBe(false);
});

it('ticks every store of a website when the website is ticked', async () => {
    await openModal();

    await tick(/^Bodea bodea$/);

    expect(checks()[1]).toEqual({
        stores: [
            { websiteCode: 'bodea', storeCode: 'bodea_outlet' },
            { websiteCode: 'bodea', storeCode: 'bodea_store' },
        ],
    });
});

it('hands the ticked stores and the shown list’s token to the screen on Clear', async () => {
    const { onClear } = await openModal();
    await tick(/Bodea Store/);

    await press(screen.getByRole('button', { name: 'Clear 9 Items' }));

    expect(onClear).toHaveBeenCalledWith([{ websiteCode: 'bodea', storeCode: 'bodea_store' }], 'tok-1');
});

it('offers no clearing when a ticked store is refused, and says why', async () => {
    withStore((stores) => (stores.length ? { choices: CHOICES, refused: 'The store bodea_store is also Bodea Demo\'s own store.' } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    const line = screen.getByText("The store bodea_store is also Bodea Demo's own store.");
    expect(line).toHaveClass('dialog-problem', 'text-notice');
    // A line where the list would land, not a box: the rule's own example.
    expect(line.closest('.inline-notice')).toBeNull();
    expect(screen.queryByText(/is another project's/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});

it('says a failed check where the list would land, and keeps the stores on screen', async () => {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (_type: string, payload: { stores: unknown[] }) =>
        payload.stores.length ? { success: false, error: 'The store did not answer.' } : { success: true, data: { choices: CHOICES } },
    );
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText("Couldn't Read the Stores: The store did not answer.")).toHaveClass('dialog-problem', 'text-negative');
    expect(screen.getByRole('checkbox', { name: /Bodea Store/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Clear Demo Data' })).toBeInTheDocument();
});

it('says the stores could not be read when the first check is refused', async () => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: false, error: 'Sign In to Adobe first.' });

    await openModal();

    const heading = screen.getByRole('heading', { name: /Couldn't Read the Stores/ });
    expect(heading.querySelector('.text-negative')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Clear Demo Data' })).not.toBeInTheDocument();
    expect(screen.getByText('Sign In to Adobe first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

it('lists the orders an ERP integration closes as their own line', async () => {
    const line = '2 orders are handled by the ERP integration (JustRite): they will be closed there, removed from its ERP, and the ERP refreshed.';
    const erp = { integration: 'JustRite', websites: ['bodea'], orders: named(['000000801', '000000802']), line };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview: { ...PREVIEW, erp } } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText(line)).toBeInTheDocument();
});

it('says why an ERP integration leaves its orders open, even with nothing else to clear', async () => {
    const line = '1 order handled by the ERP integration (JustRite) is left open: it must be updated first.';
    const erp = { integration: 'JustRite', websites: ['bodea'], orders: named(['000000801']), held: 'it must be updated first', line };
    withStore((stores) => (stores.length ? { choices: CHOICES, preview: { ...PREVIEW, total: 0, erp } } : { choices: CHOICES }));
    await openModal();

    await tick(/Bodea Store/);

    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});
