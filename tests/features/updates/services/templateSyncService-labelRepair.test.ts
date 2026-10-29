/**
 * A template update repairs the label files our stub overwrote (owner, 2026-10-22).
 *
 * The label files are preserved through an update (the storefront's own copy wins), so a
 * storefront made before the creation fix kept our stub at `placeholders/checkout.json` and
 * its checkout read "undefined". The update now puts the template's rows there, read with
 * `git show` at the commit the update brings the storefront to, and pushes them even when
 * the template has nothing else to apply. What is pinned is the git argument (which commit
 * is read) and what is written, not a mock's answer.
 */

import {
    REPO_DIR,
    TEMPLATE_HEAD,
    edsProject,
    gitCalls,
    happyGit,
    mockExecute,
    mockReadFile,
    mockWriteFile,
    pushed,
    resetFakes,
    service,
} from './templateSyncService.testUtils';
import type { BoilerplateBase } from '@/features/updates/services/boilerplateBase';
import {
    B2B_TEMPLATE_CHECKOUT_JSON,
    B2B_TEMPLATE_CHECKOUT_ROWS,
    OLD_SINGLE_SHEET_STUB_JSON,
} from '../../../helpers/placeholderLabelFixtures';

const CHECKOUT = 'placeholders/checkout.json';
const NOTE = "Fixed the checkout page's labels.";

/** The storefront's checkout label file is `checkout`; every other file as the fakes have it. */
function storefrontCheckout(checkout: string): void {
    mockReadFile.mockImplementation(async (p: string) => {
        if (p.endsWith(CHECKOUT)) return checkout;
        if (p.endsWith('fstab.yaml')) return 'MOUNTS';
        if (p.includes('placeholders/')) throw new Error('ENOENT');
        return '{"headers":{}}';
    });
}

/** git as `happyGit`, the template's checkout file at `commit`, and `changed` files in its change. */
function templateHasCheckoutAt(commit: string, changed = 'blocks/hero/hero.js\n'): void {
    mockExecute.mockImplementation(async (cmd: string) => {
        if (cmd === `git show "${commit}:${CHECKOUT}"`) return { code: 0, stdout: B2B_TEMPLATE_CHECKOUT_JSON, stderr: '' };
        if (/^git show /.test(cmd)) return { code: 128, stdout: '', stderr: 'fatal: path does not exist' };
        if (/^git diff-tree -r --name-only /.test(cmd)) return { code: 0, stdout: changed, stderr: '' };
        if (/^git status --porcelain$/.test(cmd)) return { code: 0, stdout: ` M ${CHECKOUT}\n`, stderr: '' };
        return happyGit(cmd);
    });
}

/** The last content written to the checkout label file in the clone. */
function lastCheckoutWrite(): string | undefined {
    const writes = mockWriteFile.mock.calls.filter((c) => String(c[0]) === `${REPO_DIR}/${CHECKOUT}`);
    return writes.length ? String(writes[writes.length - 1][1]) : undefined;
}

const rowsOf = (content: string | undefined): unknown =>
    (JSON.parse(content ?? 'null') as { data: { data: unknown } }).data.data;

beforeEach(() => {
    resetFakes();
});

describe("syncWithTemplate: our stub at a label path is replaced by the template's rows", () => {
    it("writes the template's checkout labels, read at the commit the update goes to, and says so", async () => {
        storefrontCheckout(OLD_SINGLE_SHEET_STUB_JSON);
        templateHasCheckoutAt(TEMPLATE_HEAD);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(gitCalls()).toContain(`git show "${TEMPLATE_HEAD}:${CHECKOUT}"`);
        expect(rowsOf(lastCheckoutWrite())).toStrictEqual(B2B_TEMPLATE_CHECKOUT_ROWS);
        expect(pushed()).toBe(true);
        expect(result).toMatchObject({ success: true, syncedCommit: TEMPLATE_HEAD, notes: [NOTE] });
    });

    it('repairs and pushes even when the template has nothing else to apply', async () => {
        storefrontCheckout(OLD_SINGLE_SHEET_STUB_JSON);
        templateHasCheckoutAt(TEMPLATE_HEAD, '');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(rowsOf(lastCheckoutWrite())).toStrictEqual(B2B_TEMPLATE_CHECKOUT_ROWS);
        expect(gitCalls()).toContainEqual(expect.stringMatching(/^git commit -m "chore: sync with template"/));
        expect(pushed()).toBe(true);
        expect(result).toMatchObject({ success: true, syncedCommit: TEMPLATE_HEAD, notes: [NOTE] });
    });

    it("leaves the SC's own checkout labels exactly as they were", async () => {
        const own = JSON.stringify({ data: [{ Key: 'Checkout.Summary.heading', Value: 'Basket ({count})' }] });
        storefrontCheckout(own);
        templateHasCheckoutAt(TEMPLATE_HEAD);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        // The preserved copy is written back unchanged, and nothing else is written there.
        expect(lastCheckoutWrite()).toBe(own);
        expect(result.notes).toBeUndefined();
    });

    it('pushes nothing when the template has nothing to apply and no stub needs repair', async () => {
        storefrontCheckout(JSON.stringify({ data: [{ Key: 'Checkout.Summary.Edit', Value: 'Change' }] }));
        templateHasCheckoutAt(TEMPLATE_HEAD, '');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(pushed()).toBe(false);
        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: TEMPLATE_HEAD });
    });
});

describe("syncBoilerplate: a colleague's storefront gets Adobe's labels at the tested version", () => {
    const TESTED_SHA = '48bed04d072fff094b49a46709b351bd719b287a';
    const BASE: BoilerplateBase = {
        template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
        commit: '71a67e027b4b288a67f5cda1fc106d2df9a34805',
        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
        found: 'first-commit',
    };

    it("replaces our stub with the rows Adobe's template has at the tested commit", async () => {
        storefrontCheckout(OLD_SINGLE_SHEET_STUB_JSON);
        templateHasCheckoutAt(TESTED_SHA);

        const result = await service().syncBoilerplate(
            edsProject({ templateOwner: 'kmanns', templateRepo: 'justrite' }),
            { base: BASE, tested: TESTED_SHA },
        );

        expect(gitCalls()).toContain(`git show "${TESTED_SHA}:${CHECKOUT}"`);
        expect(rowsOf(lastCheckoutWrite())).toStrictEqual(B2B_TEMPLATE_CHECKOUT_ROWS);
        expect(result).toMatchObject({ success: true, syncedCommit: TESTED_SHA, notes: [NOTE] });
    });
});
