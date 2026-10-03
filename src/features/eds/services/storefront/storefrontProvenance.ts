/**
 * What a storefront was built on, and whether it descends from one of our
 * templates (EDS-13f, plan `.rptc/plans/shareable-demo-patches/`, decision 1).
 *
 * Pure over data, so the add dialog (a webview) and the extension host read
 * the same answer. Three signals, strongest first:
 *
 *   1. GitHub's lineage record: `template_repository` (generated from) or
 *      `parent` (forked from) names one of our templates;
 *   2. a saved package's `builtWith.template` names one;
 *   3. the `package.json` name is Adobe's Commerce boilerplate. Weakest: any
 *      copy of the boilerplate carries it, so a caller that offers anything on
 *      this signal says the match is by name only.
 *
 * "Our templates" are the canonicals a shipped storefront is pinned to and
 * patched against: the ones with a `codePatchSource`. A shipped template we
 * do not patch (a forked brand) is not lineage for this purpose.
 *
 * @module features/eds/services/storefront/storefrontProvenance
 */

import semver from 'semver';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import type { DemoPackage } from '@/types/demoPackages';
import type { RepositoryRef, StorefrontBoilerplate, StorefrontLineage } from '@/types/projectFile';

/** The package name both Adobe Commerce canonicals carry (B2B 6.x, B2C 10.x). */
const ADOBE_COMMERCE_BOILERPLATE = '@adobe/aem-boilerplate-commerce';

/**
 * The boilerplate a `package.json` names.
 *
 * @param packageJson - The file's text; undefined when the file is absent
 * @returns The name and version, or undefined when either is missing or the text is not a package
 */
export function readBoilerplate(packageJson: string | undefined): StorefrontBoilerplate | undefined {
    if (!packageJson) return undefined;
    let parsed: unknown;
    try {
        parsed = JSON.parse(packageJson);
    } catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const { name, version } = parsed as { name?: unknown; version?: unknown };
    if (typeof name !== 'string' || typeof version !== 'string' || !name || !version) return undefined;
    return { name, version };
}

/** A stored boilerplate record, or undefined when the value is not one (settings are hand-editable). */
export function asBoilerplate(value: unknown): StorefrontBoilerplate | undefined {
    const candidate = value as Partial<StorefrontBoilerplate> | null | undefined;
    if (typeof candidate?.name !== 'string' || typeof candidate.version !== 'string') return undefined;
    return { name: candidate.name, version: candidate.version };
}

/** A stored lineage record with only its well-formed halves, or undefined when neither is. */
export function asLineage(value: unknown): StorefrontLineage | undefined {
    const candidate = value as Record<string, unknown> | null | undefined;
    const templateRepository = asRepositoryRef(candidate?.templateRepository);
    const forkParent = asRepositoryRef(candidate?.forkParent);
    if (!templateRepository && !forkParent) return undefined;
    return { ...(templateRepository ? { templateRepository } : {}), ...(forkParent ? { forkParent } : {}) };
}

function asRepositoryRef(value: unknown): RepositoryRef | undefined {
    const candidate = value as Partial<RepositoryRef> | null | undefined;
    if (typeof candidate?.owner !== 'string' || typeof candidate.repo !== 'string') return undefined;
    return { owner: candidate.owner, repo: candidate.repo };
}

/** The boilerplate in SC words: Adobe's by what it is, anything else by what it calls itself. */
export function boilerplateLabel(boilerplate: StorefrontBoilerplate): string {
    if (boilerplate.name === ADOBE_COMMERCE_BOILERPLATE) {
        return `Adobe's Commerce boilerplate ${boilerplate.version}`;
    }
    return `${boilerplate.name} ${boilerplate.version}`;
}

/**
 * The oldest boilerplate Demo Builder's fixes are tested against (EDS-13f step 05).
 *
 * Source: every patched template in `demo-packages.json` is
 * `adobe-commerce/boilerplate-b2b-template`, pinned by the patches repo's
 * `b2b/last-known-good`. At that pin the template's `package.json` read 6.0.0 on
 * 2026-09-14 (plan decision 1) and 7.0.0 on 2026-10-04 (pin 83b91cb7, committed
 * 2026-10-03): the fixes have been proven on both, so the OLDEST tested is 6.0.0.
 * Moved deliberately, never automatically: raise it only when the fixes stop being
 * proven on a major, not merely because the pin moved on.
 * A floor WARNS; it never refuses an add (owner, 2026-10-04).
 */
export const OLDEST_TESTED_BOILERPLATE = '6.0.0';

/**
 * The warning for a storefront on Adobe's boilerplate below the floor.
 *
 * @param boilerplate - What the storefront's `package.json` names
 * @returns Plain words, or undefined at/above the floor, for another package, or an unreadable version
 */
export function boilerplateFloorWarning(boilerplate: StorefrontBoilerplate): string | undefined {
    if (boilerplate.name !== ADOBE_COMMERCE_BOILERPLATE) return undefined;
    const version = semver.coerce(boilerplate.version);
    if (!version || !semver.lt(version, OLDEST_TESTED_BOILERPLATE)) return undefined;
    return `Built on an older boilerplate (${version.major}.x); some fixes may not fit.`;
}

/** Which signal tied the storefront to one of our templates. */
export type LineageSignal = 'template' | 'fork' | 'built-with' | 'package-name';

export interface LineageMatch {
    by: LineageSignal;
    /** The template of ours it descends from; absent for a match by package name, which names none. */
    template?: RepositoryRef;
}

export interface ProvenanceSignals {
    lineage?: StorefrontLineage;
    /** A saved package's `builtWith.template`. */
    builtWithTemplate?: RepositoryRef;
    boilerplate?: StorefrontBoilerplate;
}

/**
 * Does this storefront descend from one of our templates, and by which signal?
 *
 * @param signals - What is known about the storefront
 * @param packages - The catalog; defaults to the bundled one
 * @returns The strongest match, or undefined when nothing ties it to us
 */
export function ourLineage(
    signals: ProvenanceSignals,
    packages: readonly DemoPackage[] = bundledDemoPackages,
): LineageMatch | undefined {
    const ours = ourTemplates(packages);
    const candidates: Array<[LineageSignal, RepositoryRef | undefined]> = [
        ['template', signals.lineage?.templateRepository],
        ['fork', signals.lineage?.forkParent],
        ['built-with', signals.builtWithTemplate],
    ];
    for (const [by, ref] of candidates) {
        const template = ref ? ours.find((t) => sameRepository(t, ref)) : undefined;
        if (template) return { by, template };
    }
    if (signals.boilerplate?.name === ADOBE_COMMERCE_BOILERPLATE) return { by: 'package-name' };
    return undefined;
}

/** The canonicals a shipped storefront pins to and patches: the ones with a patch ledger. */
function ourTemplates(packages: readonly DemoPackage[]): RepositoryRef[] {
    const found: RepositoryRef[] = [];
    for (const pkg of packages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            const { templateOwner, templateRepo, codePatchSource } = storefront;
            if (!codePatchSource || !templateOwner || !templateRepo) continue;
            const ref = { owner: templateOwner, repo: templateRepo };
            if (!found.some((t) => sameRepository(t, ref))) found.push(ref);
        }
    }
    return found;
}

/** GitHub names repositories case-insensitively. */
function sameRepository(a: RepositoryRef, b: RepositoryRef): boolean {
    return `${a.owner}/${a.repo}`.toLowerCase() === `${b.owner}/${b.repo}`.toLowerCase();
}
