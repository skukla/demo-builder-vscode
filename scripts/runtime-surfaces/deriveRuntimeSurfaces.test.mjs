/**
 * Unit tests for the ADR-008 runtime-surface derivation prototype.
 * Run: node --test scripts/runtime-surfaces/
 *
 * Fixtures are trimmed-but-faithful snippets from the real B2B boilerplate
 * (adobe-commerce/boilerplate-b2b-template) so the patterns are grounded in
 * code that actually ships, not invented markup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    extractSurfacesFromFiles,
    derivedPaths,
    compareToHandList,
} from './deriveRuntimeSurfaces.mjs';

const find = (list, p) => list.find((e) => e.path === p);

test('derives /nav and /footer from getMetadata fallbacks, flagged metadata-overridable', () => {
    const files = [
        { path: 'blocks/header/header.js', content: `const navMeta = getMetadata('nav'); const navPath = navMeta || '/nav';` },
        { path: 'blocks/footer/footer.js', content: `const footerMeta = getMetadata('footer'); const f = footerMeta || '/footer';` },
    ];
    const { surfaces, diagnostics } = extractSurfacesFromFiles(files);
    const nav = find(surfaces.navFooter, '/nav');
    assert.ok(nav, '/nav derived');
    assert.equal(nav.provenance, 'blocks/header/header.js:1');
    assert.match(nav.note, /metadata-overridable/);
    assert.deepEqual(diagnostics.metadataOverridable.sort(), ['/footer', '/nav']);
});

test('derives code-loaded fragments that no content links to (the orphan gap)', () => {
    const files = [{
        path: 'blocks/commerce-account-sidebar/commerce-account-sidebar.js',
        content: `await loadFragment('/customer/sidebar-fragment');`,
    }];
    const { surfaces } = extractSurfacesFromFiles(files);
    const frag = find(surfaces.fragments, '/customer/sidebar-fragment');
    assert.ok(frag, 'code-loaded fragment derived');
    assert.match(frag.note, /unreachable by content crawl/);
});

test('derives explicit placeholder sheets and counts bare default fetches', () => {
    const files = [
        // Real boilerplate writes the sheet with a .json suffix — normalize it away.
        { path: 'blocks/commerce-checkout/containers.js', content: `await fetchPlaceholders('placeholders/checkout.json');` },
        { path: 'blocks/header/header.js', content: `const ph = await fetchPlaceholders();` },
    ];
    const { surfaces, diagnostics } = extractSurfacesFromFiles(files);
    assert.ok(find(surfaces.placeholderSheets, 'placeholders/checkout'), 'explicit sheet derived, .json stripped');
    assert.equal(find(surfaces.placeholderSheets, 'placeholders/checkout.json'), undefined, '.json form not kept');
    assert.ok(find(surfaces.placeholderSheets, '/placeholders'), 'default sheet derived from bare call');
    assert.equal(diagnostics.bareFetchPlaceholders, 1);
});

test('derives /customer/* auth+account pages from code literals', () => {
    const files = [
        { path: 'blocks/header/renderAuthDropdown.js', content: `link('/customer/account'); link('/customer/login');` },
        { path: 'scripts/initializers/checkout.js', content: `redirect('/customer/login');` },
    ];
    const { surfaces } = extractSurfacesFromFiles(files);
    assert.ok(find(surfaces.customerPages, '/customer/account'));
    assert.ok(find(surfaces.customerPages, '/customer/login'));
    // first-occurrence provenance wins (header before initializer)
    assert.equal(find(surfaces.customerPages, '/customer/login').provenance, 'blocks/header/renderAuthDropdown.js:1');
});

test('does not invent paths from prose / type decls passed in', () => {
    // The CLI filters .d.ts and READMEs; the extractor itself only matches quoted literals.
    const files = [{ path: 'blocks/x/README.md', content: `See /customer/account for details (no quotes here).` }];
    const { surfaces } = extractSurfacesFromFiles(files);
    assert.equal(surfaces.customerPages.length, 0, 'bare prose path not matched');
});

test('compareToHandList surfaces drift in both directions', () => {
    const files = [
        { path: 'a.js', content: `loadFragment('/customer/sidebar-fragment'); link('/customer/account');` },
    ];
    const result = extractSurfacesFromFiles(files);
    const { derivedOnly, handOnly, both } = compareToHandList(result);
    assert.ok(derivedOnly.includes('/customer/sidebar-fragment'), 'hand list misses the code-loaded fragment');
    assert.ok(both.includes('/customer/account'), 'agreement reported');
    assert.ok(handOnly.includes('/customer/create-account'), 'hand-only (content-only) surface reported');
});

test('derivedPaths returns a flat de-duplicated set', () => {
    const files = [
        { path: 'a.js', content: `link('/customer/login');` },
        { path: 'b.js', content: `redirect('/customer/login');` },
    ];
    const set = derivedPaths(extractSurfacesFromFiles(files));
    assert.equal([...set].filter((p) => p === '/customer/login').length, 1);
});
