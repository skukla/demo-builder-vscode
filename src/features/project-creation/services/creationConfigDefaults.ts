/**
 * Creation Config Defaults
 *
 * The settings defaults a new project is saved with, whichever door created it.
 *
 * The wizard fills these on its settings screen; an agent's `create_project`
 * (and `create_project_from_file`) never shows that screen, so until 2026-10-06
 * their projects were saved without them — no brand store codes, and no
 * "Product Images from AEM Assets", which defaults to Enabled. Same rule as the
 * wizard (`componentConfigDefaults`), applied at creation for every caller.
 *
 * @module features/project-creation/services/creationConfigDefaults
 */

import {
    applyFieldDefaults,
    collectConfigFields,
    isAbsentValue,
} from '@/features/components/services/componentConfigDefaults';
import { collectStackComponents } from '@/features/components/services/stackComponentCollector';
import { resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import type { ComponentRegistry } from '@/types/components';
import type { ComponentConfigs } from '@/types/webview';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * Fill every ABSENT setting of the project's components from its brand package,
 * else the catalog. A saved value — including one the user cleared to '' — is
 * never touched, so a wizard creation (already filled) comes out unchanged.
 *
 * @returns The same object when nothing was missing
 */
export function fillCreationDefaults(
    config: Pick<ProjectCreationConfig, 'components' | 'selectedPackage' | 'selectedStack' | 'demo'>,
    registry: Pick<ComponentRegistry, 'components' | 'envVars' | 'services'>,
    componentConfigs: ComponentConfigs,
): ComponentConfigs {
    const selection = config.components;
    if (!selection) return componentConfigs;

    const components = collectStackComponents(
        {
            frontend: selection.frontend,
            backend: selection.backend,
            dependencies: selection.dependencies,
        },
        registry.components,
    );
    const fields = collectConfigFields(
        components,
        registry.envVars ?? {},
        registry.services,
        selection.backend,
    );
    const packageDefaults = resolveStorefrontForProject(config)?.package.configDefaults;

    return applyFieldDefaults(
        componentConfigs,
        fields,
        packageDefaults,
        selection.backend,
        isAbsentValue,
    );
}
