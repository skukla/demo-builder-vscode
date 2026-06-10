/**
 * resolveSiteCodeSource — the general repoless-satellite primitive (Step 4).
 *
 * Decides a site's code source from the presence of an `upstream` code reference,
 * NOT from the content flow:
 *   - no upstream  → canonical: create a fresh repo, code = own repo
 *   - has upstream → satellite: reference an existing repo, no fork
 *
 * This is the same primitive multisite (ADR-003) needs: the content satellite is the
 * cross-org instance (upstream.owner !== githubOwner); a same-org multi-env site is the
 * multisite instance (upstream.owner === githubOwner). Both resolve to `createRepo: false`.
 */

import { resolveSiteCodeSource } from '@/features/eds/handlers/siteCodeSource';

describe('resolveSiteCodeSource', () => {
    it('no upstream → canonical (create a fresh repo from own coords)', () => {
        const result = resolveSiteCodeSource({ githubOwner: 'commerce-sc', repoName: 'citisignal' });
        expect(result).toEqual({ codeOwner: 'commerce-sc', codeRepo: 'citisignal', createRepo: true });
    });

    it('upstream present (cross-org) → satellite referencing the upstream, no fork', () => {
        const result = resolveSiteCodeSource({
            githubOwner: 'content-sc',
            repoName: 'citisignal',
            upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
        });
        expect(result).toEqual({ codeOwner: 'commerce-sc', codeRepo: 'citisignal-upstream', createRepo: false });
    });

    it('decision keys on the code reference, not the flow (the primitive is flow-agnostic by construction)', () => {
        // The input has no `flow` field at all — the satellite decision derives purely
        // from `upstream`. This guards against re-coupling the primitive to flow.
        const result = resolveSiteCodeSource({
            githubOwner: 'content-sc',
            repoName: 'citisignal',
            upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
        });
        expect(result.createRepo).toBe(false);
        expect(result.codeOwner).toBe('commerce-sc');
    });

    it('same-org upstream → still a satellite (the multisite shape; createRepo false)', () => {
        // ADR-003 multisite: a same-org per-env site references the org's own canonical repo.
        const result = resolveSiteCodeSource({
            githubOwner: 'commerce-sc',
            repoName: 'citisignal-stage',
            upstream: { owner: 'commerce-sc', repo: 'citisignal' },
        });
        expect(result).toEqual({ codeOwner: 'commerce-sc', codeRepo: 'citisignal', createRepo: false });
    });
});
