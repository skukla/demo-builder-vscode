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
    // v20: AGENTS.md gains the traversability + consent notes (front-load
    // get_auth_status; sign_in(dalive) returns immediately; the native consent
    // dialog and its setting). Existing projects need the sweep refresh to
    // learn agents should poll rather than wait.
    // v21: the bundle's first PreToolUse hook — the aio-global guard blocking
    // commerce-extensibility's aio-configure-global / aio-app-use / aio-where.
    // Without the bump, existing projects never receive it (the activation
    // sweep is driven by this stamp) and keep the surface where an agent can
    // desync the org selection the extension no longer uses.
    // v22: the home AGENTS.md states the active project instead of ordering a
    // `get_current_project` call to discover it — the round trip 5 of 6 measured
    // runs spent because the document told them to. Home-only, so delivery does
    // not actually depend on this stamp (the home context is rewritten on every
    // activation); bumped to keep the bundle changelog complete and honest.
    // v23: a "Querying Commerce" section naming `get_commerce_endpoints`, plus
    // the warning that a Catalog Service query with the wrong store scope
    // returns an EMPTY result and no error. A survey of 48 sessions run inside
    // demo projects (2026-08-25) found agents calling 20 of 104 tools —
    // overwhelmingly the ones this bundle NAMES — while the one long stretch of
    // real Commerce work hand-assembled 28 `curl`s. Unlike v22 this one DOES
    // depend on the stamp: it is per-project content, so without the bump
    // existing projects never receive the section.
    // v24: a "Your MCP Servers" section naming the OTHER servers a project has —
    // commerce-extensibility, playwright, dropins — and what each is for,
    // generated from ai-defaults.json so it cannot claim a server the project did
    // not get. The measurement it was written on was later disproven — seven runs
    // of zero dropins use were the wrong prompt, and the agent reaches dropins on
    // its first call when asked something only dropins can answer. The section
    // stays on its own merits; the bump stands because it IS per-project content
    // and without it existing projects never receive the section.
    //
    // v25: the six aem-boilerplate-commerce skills now actually land. They were
    // sourced from the storefront checkout, which has never held a skills/ dir,
    // so the copy ENOENT-skipped on every project ever created. The bump is what
    // makes existing projects pick them up on the next activation sweep.
    //
    // v26: the App Builder skill set follows whether a project BUILDS an App
    // Builder app, not whether it needs App Builder tooling. The bump is what
    // reconciles storefronts that already received it.
    //
    // v27: Demo Builder skills move to the `<name>/SKILL.md` directory layout —
    // the only shape Claude Code registers as an invocable skill (flat files
    // were never registered; measured live 2026-08-27). The bump is what makes
    // existing projects rewrite the layout and reconcile the flat files away.
    // v28: the project AGENTS.md states the connection-scope promise (sessions
    // in a project directory act on THAT project; the pointer never moves).
    // v29: skills route config values to configure_project (stale guidance
    // named the raw tool and agents obeyed it — measured 2/2 by the battery).
    // v30: token-first theming generalized beyond type — the design skills
    // teach the whole styles.css token system (color/spacing/shape/grid) with
    // read-the-file-first, plus the reset lifecycle stated plainly.
    // v31: extend-app-builder-app routes kit knowledge to the
    // commerce-extensibility server first (measured at zero uses across both
    // ERP journeys while agents re-derived its rules from source).
    // v32: sync-changes named the mesh deploy command `aio api:mesh:update`. No
    // such command exists — the topic is `api-mesh`, and that misspelling lived in
    // exactly one file in the repo: the shipped template. Every project generated
    // since carried it, so an agent following the skill got "command not found".
    // The bump is what delivers the correction to projects that already have it.
    it('is 32 (the mesh deploy command in sync-changes is api-mesh, not api:mesh)', () => {
        expect(AI_CONTEXT_VERSION).toBe(32);
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
            expect(Object.keys(COMPONENT_IDS)).toHaveLength(4);
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
