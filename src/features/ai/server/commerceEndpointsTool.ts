/**
 * `get_commerce_endpoints` — where to send a Commerce query, and what to send with it.
 *
 * ## The gap this closes, measured
 *
 * A survey of 48 Claude Code sessions run inside demo projects (2026-08-25)
 * found the extension's tools answering four orientation questions and little
 * else — 77% of all calls were "where am I / what is this / am I signed in /
 * what is the URL". The one long session of real Commerce work made 14 tool
 * calls against 157 other ones, and **28 of its shell commands were `curl`
 * straight at the Commerce GraphQL endpoint**, with the `Magento-*` headers
 * typed out by hand each time.
 *
 * It had to. Nothing on the surface answers "what is this project's GraphQL
 * endpoint": `get_project_urls` returns places a BROWSER can open (storefront,
 * live site, DA.live, admin, Developer Console), `get_project_status` returns
 * the mesh endpoint only, and `accsGraphqlEndpoint` appears on the surface
 * exclusively as an INPUT that `discover_store_structure` expects the caller to
 * already know. The value was reachable only by asking `get_component_config`
 * to read a `.env` by relative path — a file read, not an answer.
 *
 * ## It answers the WHOLE request, not just the URL
 *
 * An endpoint alone would not have saved those 28 curls: a Catalog Service call
 * against the wrong store scope returns an empty result and no error, which is
 * exactly the "why is phones empty?" the same session spent turns on. So this
 * returns the headers too — the same ones `configGenerator` already writes into
 * the storefront's `config.json`, from the same functions, so the agent and the
 * storefront cannot end up querying two different stores.
 *
 * ## Both endpoints, separately, because that is the real question
 *
 * `extractConfigParamsFromConfigs` collapses them — `commerceEndpoint` is
 * `meshEndpoint || config[endpointKey]`, which is right for generating
 * `config.json` and wrong here. "If a partner integrates with or without a mesh,
 * what endpoints do they need?" is a question from the surveyed session, and it
 * needs both plus a statement of which one the storefront itself uses. Getting
 * both costs no new resolution logic: the direct endpoint is the same function
 * called with no mesh, and the mesh endpoint comes from `getMeshEndpoint` — the
 * accessor `get_project_status` already reports through, so the two tools cannot
 * describe one mesh two ways.
 *
 * ## No secrets, and that is checked rather than assumed
 *
 * The component registry marks confidential values with `secret: true`
 * (`components.json`). Exactly two keys carry it — `ACCS_OAUTH_CLIENT_SECRET`
 * and `ADOBE_COMMERCE_ADMIN_PASSWORD` — and neither is read by
 * `extractConfigParamsFromConfigs` or `generateHeaders`, so neither can reach
 * this output. Verified against the registry on 2026-08-25.
 *
 * A PaaS project's headers DO carry `x-api-key` (`ADOBE_CATALOG_API_KEY`,
 * `type: text`, not secret). That is deliberate: the same key is written into
 * `config.json` and served to every browser that loads the storefront, and a
 * Catalog Service call without it fails — so withholding it would leave the tool
 * unable to do the one job it exists for, while protecting nothing.
 *
 * ## Why a tool module and not a descriptor row
 *
 * There is no handler to expose. This reads project state through an EDS
 * service (`configGenerator`), which is the same reason `get_project_status`
 * lives in its own module rather than in `READ_DESCRIPTORS`.
 *
 * @module features/ai/server/commerceEndpointsTool
 */

import { asRawText, asText } from './mcpToolResult';
import type { StateManager } from '@/core/state/stateManager';
import { getMeshEndpoint } from '@/core/state/appBuilderComponentState';
import {
    buildConfigGeneratorParams,
    extractConfigParamsFromConfigs,
    generateHeaders,
} from '@/features/eds/services/configGenerator';

/** What an agent needs before it can send a Commerce query. */
interface CommerceEndpoints {
    /** Which Commerce backend this project runs — the headers differ per backend. */
    backend: string;
    endpoints: {
        /** The backend's own GraphQL endpoint. Absent when it was never configured. */
        commerceGraphQl?: string;
        /** Catalog Service, when the backend needs a separate one (PaaS). */
        catalogService?: string;
        /** The deployed API Mesh, when this project has one. */
        mesh?: string;
    };
    /**
     * Which endpoint the STOREFRONT queries.
     *
     * A mesh, once deployed, is what `config.json` points at — so an agent
     * reproducing what the site does must use the same one, and an agent testing
     * the backend directly must not.
     */
    storefrontUses: 'mesh' | 'commerceGraphQl' | 'none';
    /**
     * Headers to send, exactly as the storefront sends them.
     *
     * `all` goes on every request; `cs` is added for Catalog Service calls. A
     * query sent without these reaches the wrong store scope and comes back
     * empty WITHOUT an error, which is the failure this field exists to prevent.
     */
    headers: { all?: Record<string, string>; cs?: Record<string, string> };
    /** The store scope those headers select. */
    scope: {
        websiteCode?: string;
        storeCode?: string;
        storeViewCode?: string;
        customerGroup?: string;
    };
}

/**
 * Which endpoint the storefront actually queries.
 *
 * A helper rather than a nested ternary — the SOP forbids those and a scan
 * enforces it. Mirrors `extractConfigParamsFromConfigs`'s own precedence
 * (`meshEndpoint || config[endpointKey]`) rather than restating it as a rule
 * that could drift from it.
 */
function resolveStorefrontTarget(
    mesh: string | undefined,
    direct: string | undefined,
): CommerceEndpoints['storefrontUses'] {
    if (mesh) return 'mesh';
    if (direct) return 'commerceGraphQl';
    return 'none';
}

/**
 * Shape the project's Commerce connection facts.
 *
 * Exported for the test, which drives it with a manifest copied from a real
 * project on disk rather than an invented shape.
 *
 * @param project - the current project
 * @returns the endpoints, headers and scope an agent needs to send a query
 */
export function buildCommerceEndpoints(
    project: Parameters<typeof buildConfigGeneratorParams>[0],
): CommerceEndpoints {
    const params = buildConfigGeneratorParams(project);

    // The DIRECT endpoint: the same resolver, called with no mesh, so the
    // backend-aware key choice (ACCS_* vs PAAS_*) stays in one place.
    // The config map's type is module-local to `configGenerator`, so the cast
    // is taken FROM its own signature rather than from a type named here — a
    // hand-written shape at a call boundary is a silenced type error, and this
    // repo has shipped four of those.
    const direct = extractConfigParamsFromConfigs(
        project.componentConfigs as Parameters<typeof extractConfigParamsFromConfigs>[0],
        undefined,
        project.componentSelections?.backend,
    ).commerceEndpoint;

    // The same accessor `get_project_status` reports through.
    const mesh = getMeshEndpoint(project);

    return {
        backend: params.environmentType ?? 'paas',
        endpoints: {
            ...(direct ? { commerceGraphQl: direct } : {}),
            ...(params.catalogServiceEndpoint
                ? { catalogService: params.catalogServiceEndpoint }
                : {}),
            ...(mesh ? { mesh } : {}),
        },
        storefrontUses: resolveStorefrontTarget(mesh, direct),
        headers: generateHeaders(params),
        scope: {
            ...(params.websiteCode ? { websiteCode: params.websiteCode } : {}),
            ...(params.storeCode ? { storeCode: params.storeCode } : {}),
            ...(params.storeViewCode ? { storeViewCode: params.storeViewCode } : {}),
            ...(params.customerGroup ? { customerGroup: params.customerGroup } : {}),
        },
    };
}

/** Registers `get_commerce_endpoints` on the MCP server. */
export function registerCommerceEndpointsTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    stateManager: StateManager,
): void {
    server.registerTool(
        'get_commerce_endpoints',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            description:
                'The Commerce API endpoints and request headers for this project: GraphQL, Catalog Service, and the deployed API Mesh, plus the store-scope headers a query needs. Use before querying the catalog, building an integration, or working out why a query returns no products.',
            inputSchema: {},
        },
        async () => {
            const project = await stateManager.getCurrentProject();
            if (!project) {
                return asRawText(
                    'Error: no current project. Use list_projects then set the current project.',
                );
            }
            return asText(buildCommerceEndpoints(project));
        },
    );
}
