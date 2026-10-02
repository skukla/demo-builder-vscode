/**
 * Delete a project's secrets from VS Code SecretStorage when the project is deleted.
 *
 * Deleting a project removed its folder and left every secret it had stored in the
 * keychain: its Commerce connection secrets, its integrations' secret settings and screen
 * keys, and the Commerce REST credential kept for its workspaces. Found 2026-10-01 while
 * adding that last one; owner: "file and address the gap". Each kind is deleted by the
 * module that owns its key scheme, so the scheme stays defined in one place.
 *
 * Not here, on purpose: the Helix publish keys, which belong to a SITE rather than a
 * project and are forgotten by the storefront teardown when the site goes; and the GitHub
 * sign-in, which belongs to the user.
 *
 * Never throws, and never logs a value: a key that will not delete is reported by kind,
 * and the project delete goes on.
 *
 * @module features/projects-dashboard/services/projectSecretCleanup
 */

import { forgetCredential } from '@/features/ai/server/savedRestCredential';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import {
    forgetAppBuilderComponentSecrets,
    type SecretDeleter,
} from '@/features/app-builder/services/componentSettingSecrets';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { forgetProjectCommerceSecrets } from '@/features/components/services/commerceSecretMigration';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** Every Adobe workspace the project's Commerce REST credential could have been kept for. */
function workspacesOf(project: Project): string[] {
    const ids = [
        project.adobe?.workspace,
        ...Object.values(project.appBuilderComponents ?? {}).map((state) => state.workspace?.id),
    ];
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** The project's components as catalog entries, by their instance ids. */
function componentEntries(project: Project): AppBuilderComponentCatalogEntry[] {
    const catalog = getAppBuilderComponentCatalog();
    return Object.keys(project.appBuilderComponents ?? {}).flatMap((id) => {
        const entry = catalogEntryFor(project, id, catalog);
        return entry ? [entry] : [];
    });
}

/**
 * @param project - the project being deleted
 * @param secrets - VS Code SecretStorage; nothing is done without it
 * @param log - where a key that would not delete is reported, by kind only
 */
export async function forgetProjectSecrets(
    project: Project,
    secrets: SecretDeleter | undefined,
    log: (line: string) => void,
): Promise<void> {
    if (!secrets || !project.path) return;
    const projectPath = project.path;
    const kinds: Array<[string, () => Promise<unknown>]> = [
        ['Commerce secrets', () =>
            forgetProjectCommerceSecrets(projectPath, Object.keys(project.componentConfigs ?? {}), secrets)],
        ['integration secrets', () => forgetAppBuilderComponentSecrets(componentEntries(project), projectPath, secrets)],
        ['Commerce REST credentials', () =>
            Promise.all(workspacesOf(project).map((id) => forgetCredential(secrets, id)))],
    ];
    for (const [kind, forget] of kinds) {
        try {
            await forget();
        } catch {
            log(`[Delete Project] Could not delete the project's ${kind} from SecretStorage`);
        }
    }
}
