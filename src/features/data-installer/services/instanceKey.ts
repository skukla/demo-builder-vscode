/**
 * One Commerce instance, spelled one way, and whether a record's instance is another one than a
 * project's now (step-07 D6). The instance is what every request names (`deriveImportInstance`:
 * the ACCS tenant id, else the PaaS URL). Shared by the engine (an install or removal on another
 * instance stops), the removal doors (`installedElsewhere`), Configure's question
 * (`connectionChange`) and Clear Commerce Instance (`instanceProjects`), so none can disagree.
 *
 * @module features/data-installer/services/instanceKey
 */

import type { DatapackId } from '@/types/datapack';

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;

/**
 * The instance spelled one way: "https://Shop.example/" and "http://shop.example" agree. An ACCS
 * tenant id is case-sensitive (base62) and kept exactly; only a URL's host is not.
 */
export function instanceKey(instance: string): string {
    const key = instance.trim();
    if (!SCHEME.test(key)) return key;
    const bare = key.replace(SCHEME, '').replace(/\/+$/u, '');
    const slash = bare.indexOf('/');
    return slash < 0 ? bare.toLowerCase() : `${bare.slice(0, slash).toLowerCase()}${bare.slice(slash)}`;
}

/**
 * Whether the record's instance is another one than the project's now. Not when either is unknown:
 * a record written before instances were kept (rule 3), or a project naming none (its removal says so).
 */
export function onAnotherInstance(recorded: string | undefined, now: string | undefined): boolean {
    if (!recorded?.trim() || !now?.trim()) return false;
    return instanceKey(recorded) !== instanceKey(now);
}

/**
 * The engine's refusal, naming the pack as the SC knows it: its remembered name, else its id's
 * name, never `name@version` (the SC never manages versions, owner 2026-11-12).
 */
export function installedOnAnotherInstanceLine(id: DatapackId, name?: string): string {
    return `${name ?? id.name} is installed on another Commerce instance. Uninstall it there first.`;
}
