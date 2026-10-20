/**
 * Keep a colleague's storefront's recorded Adobe base true after the colleague's own update
 * (EDS-56 D4, owner 2026-10-20: "A where the file records a base, else B").
 *
 * When the colleague moved their storefront to a newer Adobe boilerplate and the SC takes
 * "Changes from …", the SC's Adobe code moves without the record. The colleague's saved
 * description file (`demo.demo-builder.json`, at the root of their repository) says what
 * their code is built on as of their last "Save as demo package". After a colleague-track
 * update this reads it, and takes its base when it names the same template and that commit
 * is AHEAD of the recorded one. Anything else leaves the record (B): a stale or unreadable
 * file, another template, or a commit that is not ahead. Adobe's change then goes through the
 * 3-way apply again, which applies cleanly or stops naming the files. Never backwards.
 *
 * @module features/updates/services/boilerplateBaseRefresh
 */

import { readBoilerplateBase, writeBoilerplateBase } from './boilerplateBase';
import type { GitHubCompareResponse } from './githubApiClient';
import { readSharedDemoDescription } from '@/core/state/projectFileReader';
import type { Project } from '@/types/base';
import { SHARED_DEMO_FILE_NAME } from '@/types/projectFile';

export interface BaseRefreshDeps {
    /** One file of the colleague's repository, at a ref; undefined when it cannot be read. */
    readFile(owner: string, repo: string, path: string, ref?: string): Promise<string | undefined>;
    /** GitHub's compare on the template; null when it does not answer. */
    compare(owner: string, repo: string, base: string, head: string): Promise<GitHubCompareResponse | null>;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * @param project - a project whose colleague-track update just applied (the caller saves)
 * @param deps - the file read and the compare
 * @returns true when the recorded base moved
 */
export async function refreshBaseFromColleague(project: Project, deps: BaseRefreshDeps): Promise<boolean> {
    const base = readBoilerplateBase(project);
    const source = project.demo?.source;
    if (!base || !source) return false;
    const text = await deps.readFile(source.owner, source.repo, SHARED_DEMO_FILE_NAME, source.branch);
    const read = text ? readSharedDemoDescription(text) : undefined;
    const builtWith = read?.ok ? read.description.builtWith : undefined;
    const lkg = builtWith?.lkg;
    if (!builtWith?.template || typeof lkg !== 'string' || !COMMIT_SHA.test(lkg) || lkg === base.commit) return false;
    const sameTemplate =
        `${builtWith.template.owner}/${builtWith.template.repo}`.toLowerCase() ===
        `${base.template.owner}/${base.template.repo}`.toLowerCase();
    if (!sameTemplate) return false;
    const comparison = await deps.compare(base.template.owner, base.template.repo, base.commit, lkg);
    if (!comparison || comparison.ahead_by <= 0) return false;
    writeBoilerplateBase(project, { ...base, commit: lkg, found: 'built-with' });
    return true;
}
