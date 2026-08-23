/**
 * Core Constants Tests
 *
 * Tests for COMPONENT_IDS constant object that provides
 * type-safe access to component identifiers matching templates/components.json.
 */

import { AI_CONTEXT_VERSION, COMPONENT_IDS, ComponentId } from '@/core/constants';

describe('AI_CONTEXT_VERSION', () => {
    // Pin the current bundle version. Bump this pin ONLY together with a real
    // generated-content change (see the ai-context-authoring discipline): the
    // constant re-gates every existing project for a bundle refresh — since v8
    // via the silent activation sweep rather than a prompt.
    // v11: diagnose-demo was routing the FIRST symptom it names — "product page
    // renders empty" — to store scope and then the Commerce admin. The classic
    // cause is a refused Configuration Service write, whose distinguishing tools
    // (get_site_access, repair_site_configuration) did not exist when that skill
    // was written; an agent following the old table reported an empty catalog
    // while the catalog was fine. Plus the new import-datapack skill. Without the
    // bump, existing projects keep the wrong routing table.
    // v12: import scope defaults to the project's, not the service's. Without
    // the bump, existing projects keep a skill that does not say so — and the
    // omit-the-pair advice is exactly what used to reset against `base`.
    // v13: diagnose-demo's empty-catalog route, and the instance limits no API
    // reports. Without the bump, existing projects keep a diagnosis table that
    // sends the reader to the Commerce admin for a category tree the endpoint
    // is hiding from them.
    // v14: update-credentials told agents ALL credentials live in component `.env`
    // files and to read them with get_component_config. Passwords and client
    // secrets are now in the OS keychain, so that is wrong AND harmful — an agent
    // finding nothing could "fix" it by writing the secret back into project files
    // with update_project_config, undoing the protection. Without the bump,
    // existing projects keep an instruction that reverses a security change.
    // v15: diagnose-demo had no entry for "my change is not on the site" — the
    // symptom an agent meets every time it edits a storefront file. With nothing
    // routing it to git, one agent verified against the deployed site, read CDN
    // propagation lag as discarded commits, re-applied work that had never been
    // lost, and filed a bug about the extension force-pushing. Without the bump,
    // existing projects keep a diagnosis table with no answer for the symptom
    // that produced a false bug report.
    // v16: ai-defaults gains the `dropins` MCP entry (@dropins/mcp, EDS
    // storefronts only) and un-freezes Playwright — ^0.0.75 was an exact pin
    // (caret on a 0.0.x version allows nothing newer), now ~0.0.79. Without
    // the bump, existing projects never install the dropins server and stay
    // frozen on Playwright 0.0.75.
    // v16: ai-defaults gains the dropins MCP and un-freezes the Playwright
    // range (^0.0.75 was an exact pin on 0.0.x).
    // v17: the scraping skills claimed first Playwright use downloads ~150 MB
    // of Chromium. Measured false — the MCP uses installed Chrome by default;
    // only Chrome-less machines need the install-browser download. Without the
    // bump, existing projects keep skills that warn about a download that
    // never happens.
    // v18: the type-scale rule. AGENTS.md + two scrape-flow skills now point
    // agents at the boilerplate's --type-* scale instead of letting them
    // invent font sizes. Without the bump, existing projects keep bundles
    // whose agents pick sizes by eye.
    it('is 18 (block typography routes through the shipped --type-* scale)', () => {
        expect(AI_CONTEXT_VERSION).toBe(18);
    });
});

describe('COMPONENT_IDS', () => {
    describe('export', () => {
        it('should be exported from constants module', () => {
            expect(COMPONENT_IDS).toBeDefined();
            expect(typeof COMPONENT_IDS).toBe('object');
        });
    });

    describe('component ID values', () => {
        it('should have EDS_STOREFRONT equal to "eds-storefront"', () => {
            expect(COMPONENT_IDS.EDS_STOREFRONT).toBe('eds-storefront');
        });

        it('should have EDS_COMMERCE_MESH equal to "eds-commerce-mesh"', () => {
            expect(COMPONENT_IDS.EDS_COMMERCE_MESH).toBe('eds-commerce-mesh');
        });

        it('should have HEADLESS_COMMERCE_MESH equal to "headless-commerce-mesh"', () => {
            expect(COMPONENT_IDS.HEADLESS_COMMERCE_MESH).toBe('headless-commerce-mesh');
        });
    });

    describe('immutability (readonly)', () => {
        it('should be readonly (const assertion)', () => {
            // TypeScript enforces this at compile time with "as const"
            // At runtime, we verify by checking the object structure
            expect(Object.keys(COMPONENT_IDS)).toEqual([
                'EDS_STOREFRONT',
                'EDS_COMMERCE_MESH',
                'EDS_ACCS_MESH',
                'HEADLESS_COMMERCE_MESH',
            ]);
        });

        it('should have exactly 4 component IDs', () => {
            expect(Object.keys(COMPONENT_IDS).length).toBe(4);
        });
    });

    describe('ComponentId type', () => {
        it('should allow valid component ID values', () => {
            // Type check: these should compile without errors
            const validIds: ComponentId[] = [
                'eds-storefront',
                'eds-commerce-mesh',
                'eds-accs-mesh',
                'headless-commerce-mesh',
            ];

            // Runtime verification
            validIds.forEach((id) => {
                expect(Object.values(COMPONENT_IDS)).toContain(id);
            });
        });

        it('should provide type-safe access via COMPONENT_IDS keys', () => {
            // Type inference verification: each value should be assignable to ComponentId
            const edsStorefront: ComponentId = COMPONENT_IDS.EDS_STOREFRONT;
            const edsCommerceMesh: ComponentId = COMPONENT_IDS.EDS_COMMERCE_MESH;
            const edsAccsMesh: ComponentId = COMPONENT_IDS.EDS_ACCS_MESH;
            const headlessCommerceMesh: ComponentId = COMPONENT_IDS.HEADLESS_COMMERCE_MESH;

            expect(edsStorefront).toBe('eds-storefront');
            expect(edsCommerceMesh).toBe('eds-commerce-mesh');
            expect(edsAccsMesh).toBe('eds-accs-mesh');
            expect(headlessCommerceMesh).toBe('headless-commerce-mesh');
        });
    });
});
