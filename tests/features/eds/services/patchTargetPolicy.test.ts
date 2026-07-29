/**
 * Patch target policy
 *
 * Code patches are fetched from a public repo and written into the colleague's
 * storefront. Nothing currently restricts which files a patch may name, so a
 * ledger entry could target `package.json` (a dependency addition runs
 * arbitrary code at install time and persists) or `.github/workflows/*` (takes
 * over that repo's CI and its secrets).
 *
 * This check lives in the extension deliberately. Branch protection and CI on
 * the patches repo fail at exactly the moment they are needed — an account
 * compromise takes the workflow with it. A check at the point of consumption
 * is the only one that holds.
 *
 * The allowlist is derived from every target across every live ledger, which
 * is six files under two prefixes. Anything broader than actual usage is
 * surface we do not need.
 */

import { checkPatchTarget } from '@/features/eds/services/patchTargetPolicy';

/** Every target in use across the five live ledgers (verified 2026-07-29). */
const REAL_TARGETS = [
    'blocks/commerce-account-sidebar/commerce-account-sidebar.js',
    'blocks/header/header.js',
    'blocks/product-teaser/product-teaser.js',
    'scripts/__dropins__/tools/lib/aem/assets.js',
    'scripts/commerce.js',
    'scripts/scripts.js',
];

describe('checkPatchTarget', () => {
    describe('allows what the ledgers actually patch', () => {
        it.each(REAL_TARGETS)('allows %s', (target) => {
            expect(checkPatchTarget(target).allowed).toBe(true);
        });

        it('allows a nested path under an approved prefix', () => {
            expect(checkPatchTarget('scripts/a/b/c/deep.js').allowed).toBe(true);
        });
    });

    describe('refuses the targets that make this matter', () => {
        it('refuses package.json', () => {
            // A dependency addition executes arbitrary code at install time and
            // survives in the colleague's repo.
            const result = checkPatchTarget('package.json');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBeTruthy();
        });

        it('refuses workflow files', () => {
            // Write access to CI is write access to that repo's secrets.
            expect(checkPatchTarget('.github/workflows/deploy.yml').allowed).toBe(false);
        });

        it('refuses dotfiles carrying configuration', () => {
            expect(checkPatchTarget('.env').allowed).toBe(false);
            expect(checkPatchTarget('.npmrc').allowed).toBe(false);
        });
    });

    describe('refuses attempts to escape the allowed prefixes', () => {
        it.each([
            ['parent traversal', '../package.json'],
            ['traversal mid-path', 'blocks/../package.json'],
            ['traversal after a valid prefix', 'scripts/../../etc/passwd'],
            ['absolute path', '/etc/passwd'],
            ['leading slash on an allowed prefix', '/scripts/commerce.js'],
        ])('refuses %s', (_label, target) => {
            expect(checkPatchTarget(target).allowed).toBe(false);
        });
    });

    describe('refuses anything outside the two approved prefixes', () => {
        it.each([
            'head.html',
            '404.html',
            'fstab.yaml',
            'tools/quick-edit/quick-edit.js',
            'blocksy/header/header.js',
            'Blocks/header/header.js',
        ])('refuses %s', (target) => {
            expect(checkPatchTarget(target).allowed).toBe(false);
        });

        it('refuses non-JavaScript files even under an approved prefix', () => {
            // Every real patch targets JavaScript. Matching actual usage keeps
            // the rule tight; a future non-JS patch fails loudly and we widen
            // the rule deliberately rather than leaving the surface open.
            expect(checkPatchTarget('scripts/styles.css').allowed).toBe(false);
            expect(checkPatchTarget('blocks/header/header.json').allowed).toBe(false);
        });
    });

    describe('refuses malformed input rather than guessing', () => {
        it.each([
            ['empty', ''],
            ['whitespace', '   '],
            ['just a slash', '/'],
        ])('refuses %s', (_label, target) => {
            expect(checkPatchTarget(target).allowed).toBe(false);
        });
    });

    it('explains every refusal', () => {
        // The reason reaches the patch report, so a refused patch is visible
        // rather than a silent no-op.
        for (const target of ['package.json', '../x.js', '/abs.js', 'head.html']) {
            expect(checkPatchTarget(target).reason).toEqual(expect.any(String));
        }
    });
});
