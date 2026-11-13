/**
 * Clear Commerce Instance's projects (datapack-simplification step 06, C4): which local projects are
 * on the Commerce instance being cleared, and the instance's websites with the projects using each.
 *
 * "On the instance" is the key a removal acts on (`deriveImportInstance`: the ACCS tenant id, else
 * the PaaS URL), spelled the same way (`instanceKeyOf`: no scheme, host in lower case, no trailing
 * slash). Two Luma projects on different instances both use the website `base`, and only the one on
 * THIS instance may be named on a website or have its datapack uninstalled. A project with no key
 * matches none, except the open project itself, whose store is the one being cleared.
 *
 * Pure but for the record files, which it reads through `readProjectRecords`.
 *
 * @module features/data-installer/services/demoDataWipe/instanceProjects
 */

import { type RecordFiles, readProjectRecords } from '../demoBuilderEngine/installRecord';
import { deriveImportInstance } from '../importInstance';
import { projectWebsites } from './recordWebsites';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { InstanceWebsite } from '@/types/demoDataWipe';

/** The instance a project's removal acts on, spelled one way: "https://Shop.example/" and "http://shop.example" agree. */
export function instanceKeyOf(project: Project): string | undefined {
    const key = deriveImportInstance(project.componentConfigs)?.trim();
    if (!key) return undefined;
    const scheme = /^[a-z][a-z0-9+.-]*:\/\//iu;
    // An ACCS tenant id is case-sensitive; only a URL's host is not.
    if (!scheme.test(key)) return key;
    const bare = key.replace(scheme, '').replace(/\/+$/u, '');
    const slash = bare.indexOf('/');
    return slash < 0 ? bare.toLowerCase() : `${bare.slice(0, slash).toLowerCase()}${bare.slice(slash)}`;
}

/** The open project, then every other project on the same Commerce instance, in the order given. */
export function onSameInstance(project: Project, others: readonly Project[]): Project[] {
    const instance = instanceKeyOf(project);
    const same = others.filter((o) => o.path !== project.path && instance !== undefined && instanceKeyOf(o) === instance);
    return [project, ...same];
}

/**
 * The instance's websites, in the store's order, each naming the projects using it (its install
 * target's website, or one its records were installed to, as `projectWebsites` reads it).
 *
 * @param projects - the projects on this instance (`onSameInstance`)
 */
export async function instanceWebsites(files: RecordFiles, structure: CommerceStoreStructure, projects: readonly Project[]): Promise<InstanceWebsite[]> {
    const uses: Array<{ name: string; websites: string[] }> = [];
    for (const project of projects) {
        uses.push({ name: getProjectDisplayName(project), websites: projectWebsites(project, await readProjectRecords(files, project.path)) });
    }
    return structure.websites.map((w) => ({
        code: w.code,
        name: w.name,
        projects: uses.filter((u) => u.websites.includes(w.code)).map((u) => u.name),
    }));
}
