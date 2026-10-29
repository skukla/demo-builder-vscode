/**
 * Regenerates `.env` files for an EXISTING project from its saved state.
 *
 * Builds an {@link EnvGenerationContext} from the project manifest (with declared
 * secrets restored for the write) and hands each component to the same
 * `generateComponentEnvFile` project creation uses.
 */

import { generateComponentEnvFile } from './envFileGenerator';
import type { EnvGenerationContext } from './envVarResolution';
import type { SecretStorageLike } from '@/core/di/serviceLocator';
import { getMeshEndpointUrl } from '@/core/state/appBuilderComponentState';
import { hydrateDeclaredSecrets } from '@/features/components/services/commerceSecretMigration';
import type { ConfigMap } from '@/features/components/services/envVarHelpers';
import type { Project } from '@/types/base';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';

/**
 * Regenerate .env files for every installed component of an EXISTING project.
 *
 * Builds an {@link EnvGenerationContext} from the saved project state and delegates
 * to {@link generateComponentEnvFile} per component — the same canonical, registry-
 * driven path used at creation (env-var resolution + `derivedFrom` + grouping). This
 * is the single regeneration entry point shared by EDS Reset and the Configure screen,
 * so both produce identical .env files instead of a hand-rolled flat dump.
 *
 * The project root `.env` is intentionally NOT written here: `ProjectConfigWriter`
 * writes it on `saveProject`, and the Configure UI repopulates non-installed-component
 * values from the manifest (`componentConfigs`), not the root `.env`.
 *
 * @param project - Saved project (source of componentConfigs / meshState / selections)
 * @param registry - Loaded component registry (definitions + shared env vars + services)
 * @param logger - Logger for debug/warn output
 */
export async function regenerateProjectEnvFiles(
    project: Project,
    registry: ComponentRegistry,
    logger: Logger,
    /** ADR-015: the secret store, supplied by the boundary that starts this. */
    secrets: SecretStorageLike | undefined,
): Promise<void> {
    const context = await buildEnvGenerationContext(project, registry, logger, secrets);

    for (const [componentId, instance] of Object.entries(project.componentInstances || {})) {
        if (!instance?.path) {
            continue;
        }

        const definition = findRegistryDefinition(registry, componentId);
        if (!definition) {
            logger.warn(
                `[Env Regen] No registry definition for installed component '${componentId}', skipping .env`,
            );
            continue;
        }

        await generateComponentEnvFile(instance.path, componentId, definition, context);
    }
}

/**
 * Build the {@link EnvGenerationContext} for an EXISTING project.
 *
 * Extracted so the whole-project regeneration and the single-component write
 * below resolve env values identically — same `derivedFrom` handling, same
 * cross-component `componentConfigs` reads, same mesh endpoint.
 */
async function buildEnvGenerationContext(
    project: Project,
    registry: ComponentRegistry,
    logger: Logger,
    secrets: SecretStorageLike | undefined,
): Promise<EnvGenerationContext> {
    const backendId = project.componentSelections?.backend;

    // Declared secrets live in SecretStorage, not `componentConfigs` — but the
    // generated `.env` is how a component actually RECEIVES them at runtime, so
    // they are restored here, for this write only. Hydrating inside the context
    // builder rather than at each caller is deliberate: five call chains reach
    // `.env` generation, and a missed one writes `KEY=` and breaks the demo at
    // runtime instead of failing at the call site.
    //
    // The hydrated copy is never persisted — `project.componentConfigs` is
    // untouched, and `hydrateDeclaredSecrets` returns a copy.
    const hydratedConfigs = (await hydrateDeclaredSecrets(
        project.componentConfigs as ConfigMap,
        project.path,
        secrets,
    )) as Record<string, Record<string, string | number | boolean | undefined>> | undefined;

    return {
        registry,
        logger,
        getBackendId: () => backendId,
        getComponentConfigs: () => hydratedConfigs,
        getEnvVarDefinitions: () => registry.envVars || {},
        // Keyed-first (ADR-011 D3 Steps 07+09): the endpoint lives on the keyed
        // mesh appBuilderComponents entry (legacy meshState fallback inside).
        getMeshEndpoint: () => getMeshEndpointUrl(project),
    };
}

/** Find a component definition across every registry category. */
function findRegistryDefinition(
    registry: ComponentRegistry,
    componentId: string,
): TransformedComponentDefinition | undefined {
    const allDefinitions: TransformedComponentDefinition[] = [
        ...(registry.components.frontends || []),
        ...(registry.components.backends || []),
        ...(registry.components.dependencies || []),
        ...(registry.components.mesh || []),
        ...(registry.components.integrations || []),
    ];
    return allDefinitions.find((def) => def.id === componentId);
}

/**
 * Write ONE installed component's .env from the registry, for an existing project.
 *
 * The dashboard's mesh add/redeploy entry point. A mesh repo's `mesh.config.js`
 * calls `require('dotenv').config()` and resolves every endpoint through
 * `{env.*}`, so this must run before `aio api-mesh` — without it the deploy dies
 * on `ENOENT: no such file or directory, open '.env'`.
 *
 * Throws when the id has no registry definition. The whole-project regeneration
 * above warns-and-skips instead, because it sweeps components it did not choose;
 * a caller naming ONE component has asked for that file specifically, and
 * continuing would deploy against the missing .env this function exists to write.
 *
 * @param project - Saved project (componentConfigs / selections / mesh endpoint)
 * @param registry - Loaded component registry
 * @param logger - Logger for debug output
 * @param componentId - Registry component id (e.g. "eds-accs-mesh")
 * @param componentPath - Installed component directory
 * @throws When `componentId` resolves to no registry definition
 */
export async function regenerateComponentEnvFile(
    project: Project,
    registry: ComponentRegistry,
    logger: Logger,
    componentId: string,
    componentPath: string,
    /** ADR-015: the secret store, supplied by the boundary that starts this. */
    secrets: SecretStorageLike | undefined,
): Promise<void> {
    const definition = findRegistryDefinition(registry, componentId);
    if (!definition) {
        throw new Error(
            `No registry definition for component "${componentId}" — cannot generate its .env.`,
        );
    }
    await generateComponentEnvFile(
        componentPath,
        componentId,
        definition,
        await buildEnvGenerationContext(project, registry, logger, secrets),
    );
}
