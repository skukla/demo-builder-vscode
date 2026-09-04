/**
 * EDS Reset Params - extractResetParams Tests
 *
 * Focused unit tests for parameter extraction from a Project.
 * Verifies that template fields on the chosen storefront — including the
 * optional BYOM overlay URL — flow into EdsResetParams.
 *
 * The demo-packages config is injected directly (not jest.mock'd) so these
 * tests are deterministic regardless of worker/file ordering — a static JSON
 * module mock proved leaky across suites sharing a worker.
 */

import type { Project } from '@/types/base';
import {
    assertValidGitHubSlug,
    extractResetParams,
    resolveStorefrontConfig,
} from '@/features/eds/services/reset/edsResetParams';
import type { StorefrontConfigSource } from '@/features/eds/services/reset/edsResetParams';
import { createMockProject } from '../../../../helpers/projectFake';

const mockPackages: StorefrontConfigSource[] = [{
    id: 'citisignal',
    storefronts: {
        'eds-paas': {
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
            contentSource: { org: 'content-org', site: 'content-site' },
            contentPatches: ['patch-a'],
            byomOverlayUrl: 'https://byom.example.com',
            brandAssets: {
                source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
                files: [{ from: 'styles/theme.css', to: 'styles/theme.css' }],
                headSnippet: '<link rel="stylesheet" href="/styles/theme.css">',
            },
        },
        'eds-paas-no-overlay': {
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
            contentSource: { org: 'content-org', site: 'content-site' },
        },
    },
}];

function createProject(stackId: string): Project {
    return createMockProject({
        selectedPackage: 'citisignal',
        selectedStack: stackId,
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'eds-storefront',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'da-org',
                    daLiveSite: 'da-site',
                },
            },
        },
    });
}

describe('extractResetParams - BYOM overlay extraction', () => {
    it('reads byomOverlayUrl from the storefront template when present', () => {
        const result = extractResetParams(createProject('eds-paas'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.byomOverlayUrl).toBe('https://byom.example.com');
    });

    it('omits byomOverlayUrl when storefront does not declare one', () => {
        const result = extractResetParams(createProject('eds-paas-no-overlay'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.byomOverlayUrl).toBeUndefined();
    });
});

describe('extractResetParams - brandAssets extraction', () => {
    it('reads brandAssets from the storefront template when present', () => {
        const result = extractResetParams(createProject('eds-paas'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params).toEqual(
            expect.objectContaining({
                brandAssets: {
                    source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
                    files: [{ from: 'styles/theme.css', to: 'styles/theme.css' }],
                    headSnippet: '<link rel="stylesheet" href="/styles/theme.css">',
                },
            }),
        );
    });

    it('omits brandAssets when the storefront does not declare it', () => {
        const result = extractResetParams(createProject('eds-paas-no-overlay'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params).not.toHaveProperty('brandAssets');
    });
});

describe('extractResetParams - daLiveSite repo-name fallback (caught live 2026-08-23)', () => {
    // The loader strips a daLiveSite that equals the repo name (the normal
    // state since the DA/repo name unification), so most manifests carry only
    // githubRepo. Without the fallback, reset and refresh-block-library
    // refused every migrated project with "DA.live configuration missing" —
    // found by the pipeline rewrite's live run, one build after the strip
    // shipped.
    it('derives daLiveSite from the repo name when the manifest carries none', () => {
        const project = createProject('eds-paas');
        const metadata = (project.componentInstances!['eds-storefront']! as { metadata: Record<string, unknown> })
            .metadata;
        delete metadata.daLiveSite;

        const result = extractResetParams(project, mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.daLiveSite).toBe('test-repo');
    });

    it('an explicit daLiveSite (unmigrated legacy project) still wins', () => {
        const result = extractResetParams(createProject('eds-paas'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.daLiveSite).toBe('da-site');
    });
});

// ==========================================================
// Validation branches — every refusal asserted as the exact result the
// handler surfaces, so a flipped condition or an emptied body is a failure
// rather than a different error with the same shape.
// ==========================================================

const CONFIG_INVALID = 'CONFIG_INVALID';

function metadataOf(project: Project): Record<string, unknown> {
    return (project.componentInstances!['eds-storefront']! as { metadata: Record<string, unknown> })
        .metadata;
}

/** A citisignal/eds-paas project with the EDS metadata rewritten. */
function projectWithMetadata(metadata: Record<string, unknown>): Project {
    const project = createProject('eds-paas');
    const target = metadataOf(project);
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, metadata);
    return project;
}

describe('extractResetParams - repository validation', () => {
    it('refuses a project with no component instances at all', () => {
        const project = createProject('eds-paas');
        delete project.componentInstances;

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
            code: CONFIG_INVALID,
        });
    });

    it('refuses when the EDS instance carries no githubRepo', () => {
        const project = projectWithMetadata({ daLiveOrg: 'da-org', daLiveSite: 'da-site' });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
            code: CONFIG_INVALID,
        });
    });

    it.each(['owner-only', 'owner/', '/repo'])(
        'refuses a githubRepo that is not owner/name (%s) before any slug check',
        (githubRepo) => {
            const project = projectWithMetadata({ githubRepo, daLiveOrg: 'da-org', daLiveSite: 'da-site' });

            expect(extractResetParams(project, mockPackages)).toStrictEqual({
                success: false,
                error: 'Invalid repository format',
                code: CONFIG_INVALID,
            });
        },
    );

    it('refuses an owner with characters unsafe for a URL, naming the field', () => {
        const project = projectWithMetadata({
            githubRepo: 'bad owner/test-repo',
            daLiveOrg: 'da-org',
            daLiveSite: 'da-site',
        });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'Invalid repoOwner: must contain only alphanumeric characters, hyphens, and underscores',
            code: CONFIG_INVALID,
        });
    });

    it('refuses a repo name with characters unsafe for a URL, naming the field', () => {
        const project = projectWithMetadata({
            githubRepo: 'test-owner/bad.repo',
            daLiveOrg: 'da-org',
            daLiveSite: 'da-site',
        });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'Invalid repoName: must contain only alphanumeric characters, hyphens, and underscores',
            code: CONFIG_INVALID,
        });
    });

    it('splits owner and name on the slash, not on every character', () => {
        const result = extractResetParams(createProject('eds-paas'), mockPackages);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.params.repoOwner).toBe('test-owner');
        expect(result.params.repoName).toBe('test-repo');
    });
});

describe('extractResetParams - DA.live validation', () => {
    it('refuses when daLiveOrg is missing even though the site is present', () => {
        const project = projectWithMetadata({ githubRepo: 'test-owner/test-repo', daLiveSite: 'da-site' });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'DA.live configuration missing',
            code: CONFIG_INVALID,
        });
    });

    it('refuses an explicit empty daLiveSite rather than falling back to the repo name', () => {
        // `??` only replaces null/undefined: a persisted '' survives to the guard.
        const project = projectWithMetadata({
            githubRepo: 'test-owner/test-repo',
            daLiveOrg: 'da-org',
            daLiveSite: '',
        });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'DA.live configuration missing',
            code: CONFIG_INVALID,
        });
    });

    it('refuses a daLiveOrg with characters unsafe for a URL, naming the field', () => {
        const project = projectWithMetadata({
            githubRepo: 'test-owner/test-repo',
            daLiveOrg: 'da org',
            daLiveSite: 'da-site',
        });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'Invalid daLiveOrg: must contain only alphanumeric characters, hyphens, and underscores',
            code: CONFIG_INVALID,
        });
    });

    it('refuses a daLiveSite with characters unsafe for a URL, naming the field', () => {
        const project = projectWithMetadata({
            githubRepo: 'test-owner/test-repo',
            daLiveOrg: 'da-org',
            daLiveSite: 'da/site',
        });

        expect(extractResetParams(project, mockPackages)).toStrictEqual({
            success: false,
            error: 'Invalid daLiveSite: must contain only alphanumeric characters, hyphens, and underscores',
            code: CONFIG_INVALID,
        });
    });
});

describe('extractResetParams - template validation', () => {
    const TEMPLATE_MISSING = {
        success: false,
        error: 'Template configuration missing. Cannot reset without knowing the template repository.',
        code: CONFIG_INVALID,
    };

    it('refuses when the storefront declares an owner but no template repo', () => {
        const packages: StorefrontConfigSource[] = [
            { id: 'citisignal', storefronts: { 'eds-paas': { templateOwner: 'template-owner' } } },
        ];

        expect(extractResetParams(createProject('eds-paas'), packages)).toStrictEqual(TEMPLATE_MISSING);
    });

    it('refuses when the storefront declares a template repo but no owner', () => {
        const packages: StorefrontConfigSource[] = [
            { id: 'citisignal', storefronts: { 'eds-paas': { templateRepo: 'template-repo' } } },
        ];

        expect(extractResetParams(createProject('eds-paas'), packages)).toStrictEqual(TEMPLATE_MISSING);
    });

    it('refuses when the selected stack has no storefront in the package', () => {
        expect(extractResetParams(createProject('no-such-stack'), mockPackages)).toStrictEqual(
            TEMPLATE_MISSING,
        );
    });
});

// ==========================================================
// The params object — asserted whole, strictly, so an optional field that
// appears with an undefined value (a spread whose guard was flipped) is a
// failure and not something toEqual quietly forgives.
// ==========================================================

describe('extractResetParams - assembled params', () => {
    it('carries only the declared optional fields, keyed off the selected package', () => {
        const contentPatchSource = { owner: 'patch-owner', repo: 'patch-repo', path: 'content' };
        const codePatchSource = { owner: 'patch-owner', repo: 'patch-repo', path: 'code' };
        const packages: StorefrontConfigSource[] = [
            { id: 'other-package', storefronts: { 'eds-paas': { templateOwner: 'wrong', templateRepo: 'wrong' } } },
            {
                id: 'citisignal',
                storefronts: {
                    'eds-paas': {
                        templateOwner: 'template-owner',
                        templateRepo: 'template-repo',
                        contentSource: { org: 'content-org', site: 'content-site', indexPath: '/idx' },
                        accountContentSource: { org: 'account-org', site: 'account-site' },
                        contentPatches: ['patch-a'],
                        contentPatchSource,
                        codePatches: ['code-a'],
                        codePatchSource,
                    },
                },
            },
        ];
        const project = createProject('eds-paas');

        expect(extractResetParams(project, packages)).toStrictEqual({
            success: true,
            params: {
                repoOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'da-org',
                daLiveSite: 'da-site',
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                contentSource: { org: 'content-org', site: 'content-site', indexPath: '/idx' },
                accountContentSource: { org: 'account-org', site: 'account-site' },
                project,
                contentPatches: ['patch-a'],
                contentPatchSource,
                codePatches: ['code-a'],
                codePatchSource,
            },
        });
    });

    it('omits every optional source when the storefront declares none', () => {
        const packages: StorefrontConfigSource[] = [
            {
                id: 'citisignal',
                storefronts: { 'eds-paas': { templateOwner: 'template-owner', templateRepo: 'template-repo' } },
            },
        ];
        const project = createProject('eds-paas');

        expect(extractResetParams(project, packages)).toStrictEqual({
            success: true,
            params: {
                repoOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'da-org',
                daLiveSite: 'da-site',
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                project,
                contentPatches: undefined,
                codePatches: undefined,
            },
        });
    });
});

// ==========================================================
// resolveStorefrontConfig — the lookup on its own
// ==========================================================

describe('resolveStorefrontConfig', () => {
    it('returns the storefront for the selected package and stack', () => {
        expect(resolveStorefrontConfig(createProject('eds-paas-no-overlay'), mockPackages)).toStrictEqual({
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
            contentSource: { org: 'content-org', site: 'content-site' },
        });
    });

    it('returns an empty config when no stack is selected', () => {
        const project = createProject('eds-paas');
        delete project.selectedStack;

        expect(resolveStorefrontConfig(project, mockPackages)).toStrictEqual({});
    });

    it('returns an empty config when the selected package is not in the list', () => {
        const project = createMockProject({ selectedPackage: 'unknown', selectedStack: 'eds-paas' });

        expect(resolveStorefrontConfig(project, mockPackages)).toStrictEqual({});
    });

    it('returns an empty config when the package declares no storefronts', () => {
        const packages: StorefrontConfigSource[] = [{ id: 'citisignal' }];

        expect(resolveStorefrontConfig(createProject('eds-paas'), packages)).toStrictEqual({});
    });
});

// ==========================================================
// assertValidGitHubSlug — the regex is anchored at BOTH ends
// ==========================================================

describe('assertValidGitHubSlug', () => {
    it.each(['acme', 'Acme-Demo_01', '_'])('accepts %s', (value) => {
        expect(() => assertValidGitHubSlug(value, 'repoOwner')).not.toThrow();
    });

    it.each([
        ['a leading bad character', '.acme'],
        ['a trailing bad character', 'acme.'],
        ['a bad character in the middle', 'ac me'],
        ['an empty value', ''],
    ])('rejects %s (%s) naming the field', (_label, value) => {
        expect(() => assertValidGitHubSlug(value, 'daLiveOrg')).toThrow(
            'Invalid daLiveOrg: must contain only alphanumeric characters, hyphens, and underscores',
        );
    });
});
