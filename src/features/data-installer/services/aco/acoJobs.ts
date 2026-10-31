/**
 * The engine's ACO jobs (PL-60 P4): what Demo Builder's engine does with a pack whose kinds are all
 * ACO's, in place of the Commerce install (`demoBuilderEngine/engine.ts` routes here by the
 * request's kinds). An ACO pack goes to the project's ACO instance, so it needs no Commerce website
 * or store view; its record names the instance instead, and removal deletes from that one.
 *
 * @module features/data-installer/services/aco/acoJobs
 */

import { type RecordFiles, openInstallRecord, readInstallRecord } from '../demoBuilderEngine/installRecord';
import { skippedLine } from '../demoBuilderEngine/refusedRows';
import type { AcoClient } from './acoClient';
import { ACO_KINDS, isAcoKind } from './acoKinds';
import { type AcoPackItems, acoRowProblems, installAcoPack, removeAcoPack } from './acoPackInstall';
import type { AcoInstance, AcoStorefrontSettings } from '@/types/aco';
import type { DatapackId } from '@/types/datapack';

/** The project's ACO: what it names, and a client over its credential for an instance. */
export interface AcoAccess {
    settings: AcoStorefrontSettings;
    clientFor(instance: AcoInstance): AcoClient;
}

/** Where the engine gets the project's ACO access, or why there is none. */
export type AcoAccessSource = () => Promise<AcoAccess | { refusal: string }>;

/** Said when the engine was built without ACO access at all. */
export const NO_ACO =
    'This project does not use Adobe Commerce Optimizer, so an ACO pack has nowhere to go. Turn ACO on for the project first.';

/**
 * Said in every ACO outcome (owner, 2026-10-31: say it plainly rather than pretend). ACO's ingestion
 * API has deletes but no list or get.
 */
export const NO_READ_BACK =
    'ACO cannot be read back, so Demo Builder cannot tell whether anything this pack loaded was changed in ACO since, ' +
    'or was already there before: installing again sends every row again, and removing the pack deletes exactly what ' +
    'it loaded, by its own SKUs, slugs, codes and price book ids.';

/** Whether every kind asked for is ACO's: such a pack goes to ACO, not Commerce. */
export function asksForAco(kinds: readonly string[]): boolean {
    return kinds.length > 0 && kinds.every(isAcoKind);
}

/** Why a pack cannot be installed as it is asked for, when it mixes ACO and Commerce kinds. */
export function mixedKinds(kinds: readonly string[]): string | undefined {
    const aco = kinds.filter(isAcoKind);
    if (aco.length === 0 || aco.length === kinds.length) return undefined;
    const commerce = kinds.filter((kind) => !isAcoKind(kind));
    return (
        `The pack asks for ACO kinds (${aco.join(', ')}) and Commerce kinds (${commerce.join(', ')}) together. ` +
        'Demo Builder loads one or the other, so nothing was installed.'
    );
}

/** The ACO kinds asked for that this engine does not load. */
export function unknownAcoKinds(kinds: readonly string[]): string[] {
    return kinds.filter((kind) => !ACO_KINDS.some((entry) => entry.kind === kind));
}

const sameInstance = (a: AcoInstance, b: AcoInstance) => a.tenantId === b.tenantId && a.region === b.region && a.environment === b.environment;

const nameOf = (instance: AcoInstance) => `${instance.tenantId} (${instance.region}, ${instance.environment})`;

/** The access, or the refusal thrown. */
export async function openAco(source: AcoAccessSource | undefined): Promise<AcoAccess> {
    if (!source) throw new Error(NO_ACO);
    const access = await source();
    if ('refusal' in access) throw new Error(access.refusal);
    return access;
}

/** What one ACO job is about. */
export interface AcoJobScope {
    files: RecordFiles;
    projectPath: string;
    pack: DatapackId;
}

/**
 * Why the pack cannot be loaded now, before anything is read or written: kinds this engine does
 * not load, or a record of it in another ACO instance.
 */
export async function acoConflict(scope: AcoJobScope, kinds: readonly string[], current: AcoInstance): Promise<string | undefined> {
    const unknown = unknownAcoKinds(kinds);
    if (unknown.length > 0) return `Demo Builder does not load ${unknown.join(', ')} into ACO yet.`;
    const record = await readInstallRecord(scope.files, scope.projectPath, scope.pack);
    if (record?.aco && !sameInstance(record.aco, current)) {
        return `${scope.pack.name}@${scope.pack.version} is loaded in the ACO instance ${nameOf(record.aco)}. Remove it first, or load it there.`;
    }
    return undefined;
}

/** The rows' problems, as one refusal, or undefined when ACO could take every row. */
export function acoRowsRefusal(items: AcoPackItems, verb: 'was' | 'would be'): string | undefined {
    const problems = acoRowProblems(items);
    return problems.length > 0 ? `Nothing ${verb} installed: ${problems.join('; ')}.` : undefined;
}

/** The outcome note's locale line: the storefront reads one locale, and the pack may load others. */
function localeLine(locales: readonly string[], storefront: string): string | undefined {
    if (locales.length === 0 || locales.includes(storefront)) return undefined;
    return `The storefront reads the locale ${storefront}, and this pack's rows are for ${locales.join(', ')}, so the storefront will not show them until the locale matches.`;
}

/**
 * Load the pack into the project's ACO instance.
 *
 * @returns the outcome note
 * @throws Error naming why, before any write, for a refused row or another instance's record; an
 *   AcoApiError when ACO stops the load part way (what was sent stays on the record)
 */
export async function runAcoInstall(
    scope: AcoJobScope & { now: () => string; log: (line: string) => void; onKind: (kind: string) => void },
    access: AcoAccess,
    items: AcoPackItems,
): Promise<string> {
    const conflict = await acoConflict(scope, Object.keys(items), access.settings);
    if (conflict) throw new Error(conflict);
    const refused = acoRowsRefusal(items, 'was');
    if (refused) throw new Error(refused);
    const { tenantId, region, environment } = access.settings;
    const instance = { tenantId, region, environment };
    const recorder = await openInstallRecord(scope.files, scope.projectPath, scope.pack, scope.now, { aco: instance });
    const outcome = await installAcoPack({ client: access.clientFor(instance), recorder, log: scope.log }, items, scope.onKind);
    return [skippedLine(outcome.skipped), localeLine(outcome.locales, access.settings.locale), NO_READ_BACK].filter(Boolean).join(' ');
}

/**
 * Take the pack out of the ACO instance its record names.
 *
 * @returns how many rows were deleted, or undefined when the pack has no record here
 */
export async function runAcoRemoval(scope: AcoJobScope, source: AcoAccessSource | undefined): Promise<number | undefined> {
    const record = await readInstallRecord(scope.files, scope.projectPath, scope.pack);
    if (!record) return undefined;
    if (!record.aco) throw new Error(`The install record for ${scope.pack.name}@${scope.pack.version} names no ACO instance.`);
    const access = await openAco(source);
    const result = await removeAcoPack(access.clientFor(record.aco), scope.files, { projectPath: scope.projectPath, pack: scope.pack });
    return result.noRecord ? undefined : result.removed;
}
