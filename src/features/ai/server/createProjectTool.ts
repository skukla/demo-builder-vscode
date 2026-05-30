/**
 * create_project (Phase 3b) — headless, parameterized project creation.
 *
 * Reuses the wizard's own `buildProjectConfig` to assemble the exact creation
 * config from minimal inputs (no divergence), then calls `executeProjectCreation`
 * with `skipWorkspaceAnchor` so the window does NOT reload (which would kill the
 * live MCP session). Returns the new project's name/path; the agent keeps working
 * via name-addressed tools, and offers `open_project`/`open_view` to surface it.
 *
 * Validation follows the "validate, agent may choose" rule: an invalid
 * (package, stack) pair returns the valid options. Mesh projects pre-flight Adobe
 * auth and require a selected workspace (via the select_* tools) — otherwise a
 * structured handoff is returned instead of proceeding.
 *
 * EDS stacks are gated here and handled in a later increment (they need
 * GitHub/DA.live auth + repo/content setup).
 */

import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import {
    getAutoSelectedOptionalDependencies,
    getResolvedMeshRequirement,
    getAvailableStacksForPackage,
    getStorefrontForStack,
    loadDemoPackages,
} from '@/features/project-creation/services/demoPackageLoader';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { HandlerContext } from '@/types/handlers';
import type { WizardState } from '@/types/webview';

function asText(value: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function projectsDir(): string {
    return process.env.DEMO_BUILDER_PROJECTS_DIR ?? path.join(os.homedir(), '.demo-builder', 'projects');
}

/**
 * Register `create_project`.
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCreateProjectTool(server: any, ctxFactory: () => HandlerContext): void {
    server.registerTool(
        'create_project',
        {
            title: 'Create Project',
            description: 'Create a new Demo Builder project headlessly from a package + stack. Requires confirm:true',
            inputSchema: {
                projectName: z.string().describe('Name for the new project'),
                package: z.string().describe('Demo package / brand id (from list_demo_packages)'),
                stack: z.string().describe('Architecture stack id (from list_stacks)'),
                confirm: z.boolean().optional().describe('Must be true — creates a project (clones repos, installs dependencies)'),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const projectName = String(args?.projectName ?? '').trim();
            const pkgId = String(args?.package ?? '');
            const stackId = String(args?.stack ?? '');
            if (!projectName || !pkgId || !stackId) {
                return asText({ error: 'projectName, package, and stack are all required.' });
            }
            if (args?.confirm !== true) {
                return asText({
                    error: 'create_project requires confirm:true — it clones repos and installs dependencies. Ask the user to confirm.',
                });
            }

            // EDS creation needs GitHub/DA.live auth + repo/content setup — gated for now.
            if (stackId.startsWith('eds-')) {
                return asText({
                    error: 'EDS project creation via this tool is not available yet. Use the creation wizard for EDS stacks.',
                    stack: stackId,
                });
            }

            // Validate the (package, stack) pair against the storefronts map.
            const packages = await loadDemoPackages();
            const pkg = packages.find((p) => p.id === pkgId);
            if (!pkg) {
                return asText({ error: `Unknown package: ${pkgId}`, validPackages: packages.map((p) => p.id) });
            }
            const storefront = await getStorefrontForStack(pkgId, stackId);
            if (!storefront) {
                return asText({
                    error: `Package "${pkgId}" has no "${stackId}" storefront.`,
                    validStacksForPackage: await getAvailableStacksForPackage(pkgId),
                });
            }

            const ctx = ctxFactory();

            // Mesh projects need Adobe auth + a selected workspace.
            const needsMesh = getResolvedMeshRequirement(pkg, stackId) === true;
            let adobeOrg: WizardState['adobeOrg'];
            let adobeProject: WizardState['adobeProject'];
            let adobeWorkspace: WizardState['adobeWorkspace'];
            if (needsMesh) {
                const mgr = ctx.authManager;
                if (!mgr || !(await mgr.isAuthenticated())) {
                    return asText({
                        needsAuth: 'adobe',
                        message: 'This project deploys an API Mesh and needs Adobe sign-in. Use get_auth_status, then sign_in(provider:"adobe", confirm:true).',
                    });
                }
                adobeWorkspace = (await mgr.getCurrentWorkspace()) as WizardState['adobeWorkspace'];
                if (!adobeWorkspace) {
                    return asText({
                        error: 'This project needs an Adobe workspace for API Mesh. Select one first: select_org → select_project → select_workspace.',
                    });
                }
                adobeOrg = (await mgr.getCurrentOrganization()) as WizardState['adobeOrg'];
                adobeProject = (await mgr.getCurrentProject()) as WizardState['adobeProject'];
            }

            // Assemble the exact config the wizard would, via buildProjectConfig.
            const optionalDependencies = await getAutoSelectedOptionalDependencies(pkgId, stackId);
            const wizardState = {
                projectName,
                selectedPackage: pkgId,
                selectedStack: stackId,
                selectedOptionalDependencies: optionalDependencies,
                adobeOrg,
                adobeProject,
                adobeWorkspace,
                componentConfigs: {},
                selectedAddons: [],
                selectedBlockLibraries: [],
                customBlockLibraries: [],
            } as unknown as WizardState;

            const config = buildProjectConfig(wizardState, null, packages) as unknown as Record<string, unknown>;

            try {
                await executeProjectCreation(ctx, config, { skipWorkspaceAnchor: true });
            } catch (err) {
                return asText({ created: false, error: err instanceof Error ? err.message : String(err) });
            }

            return asText({
                created: true,
                name: projectName,
                path: path.join(projectsDir(), projectName),
                hint: 'The project is created. Operate on it by name with the project tools (list_blocks, update_project_config, sync_storefront, …). Offer open_project to open it in VS Code for native file editing.',
            });
        },
    );
}
