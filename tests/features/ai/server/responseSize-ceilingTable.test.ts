/**
 * The response-ceiling table keeps up with the tool surface, in both directions: every tool
 * has a ceiling, an exemption or an IOU, and no ceiling names a tool that is gone. Split from
 * `responseSize.test.ts` (2026-10-27) when merging the datapack file tools took it past 750
 * lines; that file measures the sizes, this one checks the table covers every tool.
 */

import * as fs from 'fs';
import * as path from 'path';
import { RESPONSE_CEILINGS } from './responseCeilings';
import { ALL } from './responseSize.testUtils';

// ─── audit coverage ──────────────────────────────────────────────────────────
//
// The table is only a guard while it keeps up with the surface. This asserts the
// relationship in both directions, because either drift is a silent hole: a new
// tool with no recorded size is one nobody is watching, and a stale entry is a
// ceiling defending a tool that no longer exists.
describe('the ceiling table tracks the tool surface', () => {
    const descriptorTools = ALL.map((d) => d.tool);

    // Exempt: rows whose response is a fixed short status by construction and
    // which no measurement has ever found large. Listed rather than inferred,
    // so adding a tool cannot silently join them.
    const EXEMPT = new Set([
        // Datapack files: a path, a byte count and at most one entry per data type —
        // bounded by the 28 type codes, never by the size of the pack's rows, which
        // go to disk or to the store and never into the response.
        'save_datapack_zip',
        'open_datapack_zip',
        'load_datapack_zip',
        'delete_library_datapack',
        'copy_library_datapack_to_installer',
        'regenerate_ai_files',
        'start_demo',
        'stop_demo',
        'rename_project',
        // `{added: {id, name, kind}}`: three short strings, nothing that scales.
        'add_integration',
        // Rename: two short strings. `set_console_apis`: `{code, name?}` per subscribed
        // API, the credential-bounded union `add_console_apis` returns exempt.
        // `set_project_destination`: the refs and a move summary, bounded by integration COUNT.
        'rename_integration',
        'set_console_apis',
        'set_project_destination',
        'deploy_integration',
        'redeploy_integration',
        'remove_integration',
        'save_app_to_github', // one repository's owner, name, URL and file count (AB-1c)
        'delete_app_github_repo', // the name it deleted
        // `{namespace, deleted, failed}`: bounded by what one app left behind.
        // `{id, erp, loaded}`: four counts and a sentence, whatever the catalogue's size.
        'load_erp_demo_data',
        // `{added, integration, erpList, owns, existingOwns}`: one id and name, the list's ids, and
        // one short rule per ERP (at most a few ERPs).
        'add_erp',
        // AB-74: one short row per attribute set; the undo's counts and five SKUs.
        ...['add_erp_owner_to_attribute_sets', 'remove_erp_owner_from_attribute_sets', 'undo_erp_assignment'],
        ...['prepare_commerce_store', 'undo_commerce_store_preparation', 'set_commerce_config'], // AB-77: nine short rows
        'delete_undeclared_runtime_code',
        'deploy_mesh',
        'delete_mesh',
        'save_ai_prompt',
        'delete_ai_prompt',
        'export_project_settings',
        'refresh_block_library',
        'add_console_apis',
        'check_mesh',
        'check_datapack_service',
        'get_store_structure',
        'get_project_urls',
        'get_datapack',
        'list_datapack_data_types',
        'find_datapacks',
        'list_installed_datapacks',
        'get_datapack_activity',
        'verify_ai_setup',
        'list_ai_prompts',
        'list_console_apis',
        // Group 5. `restart_demo` mirrors start/stop_demo. `set_project_pinned`
        // is a boolean write.
        'restart_demo',
        'set_project_pinned',
        // Group 7. Four short strings on the install branch, two on the
        // manual one — bounded by nothing that scales with the machine or
        // the stack.
        'install_prerequisite',
        // Group 8's three job-handle writes. Each returns an activation id or
        // a short per-type outcome list — bounded by the number of DATA TYPES
        // in one datapack, not by how much data moved.
        'start_datapack_import',
        'reset_datapack',
        'start_datapack_export',
        // A target reference and a status record. Both fixed-shape.
        'get_datapack_import_target',
        'get_datapack_import_status',
        // AB-5 pair. `install_integration` returns one three-field install
        // record. `get_integration_install_status` returns that record plus
        // the live status and FAILED step names — bounded by the app's own
        // installer step count (the kit's whole tree measured ~23 nodes),
        // not by anything that scales with the project.
        'install_integration',
        'get_integration_install_status',
        // Uninstall then install; answers the same install record.
        'reinstall_integration',
        // One sentence; and one short row per integration, bounded by the
        // project's integration count.
        'update_integration',
        'check_integration_updates',
        // The ERP pair. `get_erp_status` is the integration's own status
        // action (a health object, a base URL, one ledger count) beside two
        // persisted rows; `reset_erp_records` is the reset's report (four
        // counts). Neither scales with the project or the instance.
        'get_erp_status',
        'reset_erp_records',
        // Three strings: the integration id, the ERP id and the screen address.
        'open_erp_screen',
        // `get_erp_record`: a fixed set of labelled rows (three for a product,
        // five for a company), each two short strings. `get_erp_order_trace`: one
        // order's steps — bounded by what happened to ONE order, never by the
        // project, the catalog or the instance.
        'get_erp_record',
        'get_erp_order_trace',
        // One row per setting the catalog entry declares — a handful, bounded by
        // the entry, not by the project or the instance.
        'get_integration_settings',
        'set_integration_settings',
        // An ERP's own settings (AB-16j): fixed shapes, bounded by the ERP entry.
        'get_erp_settings',
        'set_erp_settings',
        // The demo ERP's look or its downtime window (AB-59): a few short strings.
        'set_erp_appearance',
        'start_erp_downtime',
        'end_erp_downtime',
        // One row per setup step the catalog entry declares (two for the ERP integration),
        // bounded by the entry, not by the project or the instance.
        'get_setup_checklist',
        'set_setup_step',
        'check_setup_steps',
    ]);

    it('records a ceiling for every DESCRIPTOR tool that is not deliberately exempt', () => {
        // Rows built but not yet driven against a live extension. Distinct from
        // EXEMPT on purpose: exempt is a decision, this is an IOU. A ceiling is a
        // live measurement, and inventing one from the stub harness would record a
        // number no production payload ever produced. These get promoted to real
        // ceilings in the same F5 pass that first exercises them; anything left
        // here after that pass is a tool nobody actually ran.
        //
        // Group 8's three variable-size rows. Each returns something whose size
        // depends on a live service — a merchant's store hierarchy, the service's
        // validation verdict, a page of real catalog items — and inventing a
        // number for any of them from the stub would record a size no production
        // payload ever produces. The three fixed-shape writes and two fixed-shape
        // reads are EXEMPT above on their shape; these are the ones that need a
        // measurement.
        // Empty again: Group 8's three variable-size rows were probed against a
        // real Data Installer and now carry measured ceilings. A row lands here
        // only between being built and being probed.
        // list_runtime_packages: one name per package, so its size is the size of
        // somebody's namespace. Measured on the first live call, then promoted.
        // assign_erp_products (AB-74): its unknown SKUs are as long as what was pasted.
        // preview_datapack_changes and save_store_changes_to_pack (datapack-engine step 05): the
        // preview's size is the number of kinds a pack holds, at most three names each, and the
        // plan sets its ceiling from Frescopa and Bodea measured live; neither has run live yet.
        // rename_datapack (datapack-engine step 07): three fixed fields; not yet run live.
        // check_demo_data and clear_demo_data (step 10): see below; not yet run live.
        const PENDING_LIVE_MEASUREMENT = new Set<string>([
            'list_runtime_packages',
            'assign_erp_products',
            'preview_datapack_changes',
            'save_store_changes_to_pack',
            'rename_datapack',
            // check_demo_data and clear_demo_data (datapack-engine step 10): counts and at most
            // three names per kind; neither has run live yet.
            'check_demo_data',
            'clear_demo_data',
            // share_datapack (owner, 2026-10-30): three fixed fields; not yet run live.
            'share_datapack',
        ]);

        const missing = descriptorTools.filter(
            (t) => !RESPONSE_CEILINGS[t] && !EXEMPT.has(t) && !PENDING_LIVE_MEASUREMENT.has(t)
        );
        expect(missing).toStrictEqual([]);

        // An IOU that is already paid is rot in the other direction.
        const paid = [...PENDING_LIVE_MEASUREMENT].filter((t) => RESPONSE_CEILINGS[t]);
        expect(paid).toStrictEqual([]);
    });

    /**
     * The check above walks DESCRIPTOR rows. Tools registered directly — the
     * `*Tools.ts` modules and `registerProjectTools` in `src/mcp-server.ts` — never
     * pass through it, so until 2026-08-24 nothing asserted anything about what
     * they return. Measured that day: 57 directly-registered tools, 47 carrying a
     * ceiling anyway and **10 with neither a ceiling nor an exemption**.
     *
     * This is the same shape as the bug the response-envelope guard shipped with —
     * its first version scanned one directory and missed ten tools in
     * `src/mcp-server.ts`, caught by two reviewers independently. A guard that
     * covers one of two registration paths reads as full coverage and is not.
     *
     * The ten are listed as IOUs rather than given invented ceilings: several
     * (`create_project`, `reset_project`, `apply_updates`) return
     * progress/summary payloads whose real size only a live run produces, and a
     * number guessed from a stub records a size production never emits. Promote
     * each to a real ceiling — or to EXEMPT, if a live look shows a fixed short
     * status — as an F5 pass exercises it.
     */
    it('records a ceiling, an exemption, or an IOU for every DIRECTLY-registered tool', () => {
        const registrarSrc = [
            'src/mcp-server.ts',
            ...fs
                .readdirSync(path.join(__dirname, '../../../../src/features/ai/server'))
                .filter((f) => f.endsWith('.ts'))
                .map((f) => `src/features/ai/server/${f}`),
        ];
        const registered = new Set<string>();
        for (const rel of registrarSrc) {
            const src = fs.readFileSync(path.join(__dirname, '../../../../', rel), 'utf-8');
            for (const m of src.matchAll(/registerTool\(\s*['"]([a-z0-9_]+)/g)) {
                registered.add(m[1]);
            }
        }
        const directOnly = [...registered].filter((t) => !descriptorTools.includes(t));

        // Control: the direct path must be non-empty, or this test proves nothing.
        expect(directOnly.length).toBeGreaterThan(20);

        /**
         * Directly-registered tools awaiting a live measurement (2026-08-24).
         * Shrinking this list is the work; adding to it silently is the rot.
         */
        const DIRECT_PENDING = new Set<string>([
            'apply_updates',
            // 2026-10-21 (EDS-57): its preview carries the clashing files' diff, so its size
            // depends on a real clash; measured on the first live run (JustRite's header).
            'finish_storefront_update',
            'create_project',
            'copy_project',
            'create_project_from_file',
            'delete_project',
            'edit_project',
            'get_settings',
            'open_url',
            'open_view',
            'reset_project',
            'set_setting',
            'sign_in',
        ]);

        const unwatched = directOnly.filter(
            (t) => !RESPONSE_CEILINGS[t] && !EXEMPT.has(t) && !DIRECT_PENDING.has(t)
        );
        expect(unwatched).toStrictEqual([]);

        // Same both-directions rule as above: a paid IOU left listed is rot.
        const paidDirect = [...DIRECT_PENDING].filter((t) => RESPONSE_CEILINGS[t] || EXEMPT.has(t));
        expect(paidDirect).toStrictEqual([]);

        // The exemption list needs the same two-way check as the ceilings, or it
        // rots in the direction nothing notices: an entry that names no descriptor
        // row can never match, so it sits there reading as a decision. Found this
        // way — `apply_updates` is a bespoke tool and was never in scope here.
        const stale = [...EXEMPT].filter((t) => !descriptorTools.includes(t));
        expect(stale).toStrictEqual([]);
    });

    it('has no ceiling for a tool that no longer exists', async () => {
        // Every recorded name must still be a real tool somewhere in the surface.
        // Descriptor rows are checked here; the bespoke ones are asserted by the
        // suites that drive them, which fail on an unknown name.
        const { readdirSync, readFileSync } = await import('fs');
        const dir = 'src/features/ai/server';
        const sources = readdirSync(dir)
            .filter((f) => f.endsWith('.ts'))
            .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
            .join('\n');
        const mcpServer = readFileSync('src/mcp-server.ts', 'utf8');
        const blob = sources + mcpServer;

        const orphans = Object.keys(RESPONSE_CEILINGS).filter((t) => !blob.includes(`'${t}'`));
        expect(orphans).toStrictEqual([]);
    });
});
