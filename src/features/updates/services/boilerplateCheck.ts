/**
 * Check for Updates' Adobe boilerplate check (EDS-56): for each storefront built from a
 * colleague's demo whose Adobe base is known, is our tested version (the patches repo's
 * last-known-good) ahead of it?
 *
 * Independent of the template check, which keeps following the colleague's repository: a
 * project can have both, and the SC may take one without the other. A base found for the
 * first time is recorded here, so the lookup's GitHub reads happen once per project.
 *
 * Never "up to date" on a read that failed (ADR-006 D1): a pointer that cannot be read or a
 * comparison GitHub does not answer is a warning and no entry. Never backwards: a base the
 * tested version is not ahead of is left alone.
 *
 * @module features/updates/services/boilerplateCheck
 */

import type * as vscode from 'vscode';
import { compareCommits } from './githubApiClient';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import {
    resolveBoilerplateBase,
    writeBoilerplateBase,
    type BoilerplateBase,
    type BoilerplateGitHub,
} from '@/features/updates/services/boilerplateBase';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** One storefront whose Adobe code can move from `base.commit` to `tested`. */
export interface BoilerplateUpdate {
    project: Project;
    base: BoilerplateBase;
    /** The tested template commit it would move to. */
    tested: string;
}

export interface BoilerplateCheckDeps {
    secrets: vscode.SecretStorage;
    logger: Logger;
    github: BoilerplateGitHub;
    /** Saves a project whose base was just found. */
    save(project: Project): Promise<void>;
    /** The pointer read; the patches repo's in production. */
    readTested?: typeof readLkgSha;
    /** GitHub's compare; the REST one in production. */
    compare?: typeof compareCommits;
}

/**
 * @param projects - the projects to check
 * @param deps - the GitHub reads, the token, the save and the logger
 * @returns one entry per storefront whose tested version is ahead of its base
 */
export async function checkBoilerplate(projects: Project[], deps: BoilerplateCheckDeps): Promise<BoilerplateUpdate[]> {
    const found: BoilerplateUpdate[] = [];
    for (const project of projects) {
        const update = await checkOne(project, deps);
        if (update) found.push(update);
    }
    return found;
}

async function checkOne(project: Project, deps: BoilerplateCheckDeps): Promise<BoilerplateUpdate | undefined> {
    const { logger } = deps;
    const lookup = await resolveBoilerplateBase(project, { github: deps.github, logger });
    if ('reason' in lookup) {
        logger.debug(`[Updates] No Adobe boilerplate update for ${project.name}: ${lookup.reason}`);
        return undefined;
    }
    const { base } = lookup;
    if (!lookup.recorded) {
        writeBoilerplateBase(project, base);
        await deps.save(project);
    }
    const tested = await (deps.readTested ?? readLkgSha)(base.lkgSource, logger);
    if (!tested) {
        logger.warn(`[Updates] Could not read the tested Adobe boilerplate for ${project.name}`);
        return undefined;
    }
    if (tested === base.commit) return undefined;
    const { owner, repo } = base.template;
    const comparison = await (deps.compare ?? compareCommits)(deps.secrets, owner, repo, base.commit, tested);
    if (!comparison) {
        logger.warn(`[Updates] Could not compare ${project.name}'s Adobe boilerplate with the tested version`);
        return undefined;
    }
    return comparison.ahead_by > 0 ? { project, base, tested } : undefined;
}
