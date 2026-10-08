/**
 * What the import modal can be prefilled with: the target the project implies,
 * and the websites and store views a pack can land on.
 *
 * Split out of `importHandlers.ts` (decompose-god-file, 2026-10-08): both are
 * READS that write nothing and run no guard, and they change when the project
 * shape or store discovery changes — not when the import spine does.
 *
 * Merged into `importHandlers` so the panel and the MCP descriptors keep one
 * handler map to reach for.
 *
 * @module features/data-installer/handlers/importTargetHandlers
 */

import { resolveProjectCredentials } from '../services/commerceCredentialBroker';
import { deriveImportInstance } from '../services/importInstance';
import {
    buildScopeDiscoveryParams,
    groupStoreViewsByWebsite,
} from '../services/importScopeDiscovery';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import { discoverStoreStructure } from '@/features/eds/services/commerceStoreDiscovery';
import type { Project } from '@/types/base';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

export const importTargetHandlers = defineHandlers({
    /**
     * What the import modal should prefill as the target, and where it came from.
     *
     * The field started empty because a spike could not PROVE the target was
     * derivable — none of the instances with Data Installer history matched a local
     * project, so a derived value had nothing to be checked against, and guessing a
     * write target with no undo was the wrong trade.
     *
     * Both halves of that reasoning have since expired. `checkCredentials` tests an
     * instance read-only, so a derived value is now verifiable before anything is
     * written. And the derivation already existed: `ACCS_ENDPOINT_PATTERN` has been
     * pulling the tenant id out of `ACCS_GRAPHQL_ENDPOINT` all along to build the
     * admin URL, and that id is a 21–22 character base62 nanoid — the shape the
     * spike measured for `commerce_instance`.
     *
     * **This answers; it does not decide.** It reports the instance the project
     * implies and nothing else — the field stays editable, and a dry run is what
     * checks a seeded value before an import writes with it.
     */
    'get-datapack-import-target': async (context: HandlerContext): Promise<HandlerResponse> => {
        // No guard and no client: this reads project state only. A missing project
        // is not a failure — the catalog is browsable without one, and the modal
        // simply asks the user to type the target.
        const project: Project | undefined = await context.stateManager.getCurrentProject();
        const configs = project?.componentConfigs ?? {};
        // The id is what the service needs and what nobody can read. The project
        // name is the only human-recognisable handle on the same target, so it
        // rides along for the modal to lead with.
        const projectName = project?.name;
        // The sample data this project was CREATED to hold, recorded by the
        // wizard's Sample Data area and never imported there. Reported here so
        // the panel can offer it directly instead of making the user re-find it
        // in a 25-name catalog.
        const datapack = project?.datapack;

        // The website/store view the project recorded, from the SAME resolver the
        // build path uses. The modal used to seed its pickers from live discovery
        // instead, preferring a website named `base` — which is simply wrong on a
        // project configured for another one, and made a modal-driven reset
        // target a different scope than the project reset. The project is the
        // definitive source; this is where it gets asked.
        //
        // `resolveInstallTarget` returns the store VIEW code, not the store group:
        // the service's `store_code` is a view code. Both codes or neither.
        const scope = resolveInstallTarget({
            componentSelections: project?.componentSelections,
            componentConfigs: configs,
        });

        // Shared with the build's sample-data phase — see `deriveImportInstance`.
        // Two derivations would let the same pack land in different places
        // depending on which surface asked, with nothing to report the difference.
        const instance = deriveImportInstance(configs);
        if (instance) {
            return {
                success: true,
                data: { instance, projectName, datapack, ...(scope && { scope }) },
            };
        }

        return { success: true, data: { datapack, ...(scope && { scope }) } };
    },

    /**
     * The websites and store views a pack can be imported onto.
     *
     * Targeting is the INTENDED path (the service author, 2026-08-14: create the
     * website first, "then you can specify site and store on the data pack
     * import"). This is what fills that picker.
     *
     * **Discovery runs here, not in the webview.** The wizard's
     * `useStoreDiscovery` posts PaaS admin credentials from the panel because
     * the wizard holds them in form state; this feature deliberately keeps the
     * pair extension-side. So the structure is discovered where the credentials
     * already live and only the codes travel back.
     *
     * Optional by design: no project, no credentials or a failed discovery all
     * leave the user with a manual import onto the service's default. Only a
     * discovery that actively failed is worth an error — the rest is an empty
     * list.
     */
    'list-datapack-import-scopes': async (context: HandlerContext): Promise<HandlerResponse> => {
        const project = await context.stateManager.getCurrentProject();
        if (!project) {
            return { success: true, data: { websites: [] } };
        }

        const credentials = await resolveProjectCredentials(context, project);
        if (!credentials.ok) {
            // Not an error: the import still works, it just lands on the default.
            return { success: true, data: { websites: [] } };
        }

        const params = await buildScopeDiscoveryParams(context, project, credentials.credentials);
        if (!params) {
            return { success: true, data: { websites: [] } };
        }

        const result = await discoverStoreStructure(params);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: { websites: groupStoreViewsByWebsite(result.data) } };
    },
});
