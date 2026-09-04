/**
 * aiToolingGate — which projects get the App Builder / Commerce Extensibility
 * AI tooling (the Developer Agent MCP + skills), and which ai-defaults entries
 * apply to a given project.
 */

import {
    projectNeedsAppBuilderTooling,
    aiDefaultsEntryApplies,
    gatedSkillReasons,
    resolveAvailableMcpToolIds,
    setThirdPartyToolsResolver,
} from '@/features/project-creation/services/aiBundle/aiToolingGate';
import { SKILL_MCP_TOOL_DEPENDENCIES } from '@/types/ai';
import { COMPONENT_IDS } from '@/core/constants';
import type { AiDefaultsMcpServer } from '@/types/aiDefaults';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

function makeProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/projects/demo',
        // Project.created is a Date in memory; the ISO string is the manifest form.
        created: new Date(),
        ...overrides,
    });
}

function makeEntry(overrides: Partial<AiDefaultsMcpServer> = {}): AiDefaultsMcpServer {
    return {
        id: 'x',
        package: '@x/x',
        version: '^1.0.0',
        command: 'node',
        args: ['node_modules/@x/x/index.js'],
        description: 'x',
        requires: 'app-builder-tooling',
        ...overrides,
    };
}

describe('projectNeedsAppBuilderTooling', () => {
    it('is false for a bare project (no storefront, no mesh, no app-builder components)', () => {
        expect(projectNeedsAppBuilderTooling(makeProject())).toBe(false);
    });

    // A manifest written before componentInstances existed has no such key at all,
    // and the sweep reads those projects on activation.
    it('is false for a project whose manifest carries no componentInstances at all', () => {
        expect(projectNeedsAppBuilderTooling(makeProject({ componentInstances: undefined }))).toBe(
            false
        );
    });

    it('is true when an EDS storefront is installed (existing behavior preserved)', () => {
        const project = makeProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: {
                    id: COMPONENT_IDS.EDS_STOREFRONT,
                    name: 'EDS Storefront',
                    status: 'ready',
                    path: '/projects/demo/storefront',
                },
            },
        });
        expect(projectNeedsAppBuilderTooling(project)).toBe(true);
    });

    it('is true when a mesh component instance exists', () => {
        const project = makeProject({
            componentInstances: {
                [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                    id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
                    name: 'API Mesh',
                    status: 'ready',
                    path: '/projects/demo/mesh',
                },
            },
        });
        expect(projectNeedsAppBuilderTooling(project)).toBe(true);
    });

    it('is true when an App Builder component is attached', () => {
        const project = makeProject({
            appBuilderComponents: {
                'app-builder-shell': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'app-builder-shell' },
                },
            },
        });
        expect(projectNeedsAppBuilderTooling(project)).toBe(true);
    });
});

describe('aiDefaultsEntryApplies', () => {
    const edsProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/storefront',
            },
        },
    });
    const meshOnlyProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
                name: 'API Mesh',
                status: 'ready',
                path: '/projects/demo/mesh',
            },
        },
    });
    const bareProject = makeProject();

    it("requires: 'eds-storefront' applies only when a storefront is installed", () => {
        const entry = makeEntry({ requires: 'eds-storefront' });
        expect(aiDefaultsEntryApplies(entry, edsProject)).toBe(true);
        expect(aiDefaultsEntryApplies(entry, meshOnlyProject)).toBe(false);
        expect(aiDefaultsEntryApplies(entry, bareProject)).toBe(false);
    });

    it("requires: 'app-builder-tooling' applies to storefront, mesh, and app-builder projects", () => {
        const entry = makeEntry({ requires: 'app-builder-tooling' });
        expect(aiDefaultsEntryApplies(entry, edsProject)).toBe(true);
        expect(aiDefaultsEntryApplies(entry, meshOnlyProject)).toBe(true);
        expect(aiDefaultsEntryApplies(entry, bareProject)).toBe(false);
    });
});

describe('resolveAvailableMcpToolIds', () => {
    // Bound to the REAL ai-defaults.json entries — these tests double as pins
    // on the entry ids and package names the gating contract depends on.
    const ALL_PACKAGES = [
        '@adobe-commerce/commerce-extensibility-tools',
        '@playwright/mcp',
    ];

    const edsProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/storefront',
            },
        },
    });
    const meshOnlyProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
                name: 'API Mesh',
                status: 'ready',
                path: '/projects/demo/mesh',
            },
        },
    });

    it('contains both tool ids for an EDS project with both packages installed', () => {
        const available = resolveAvailableMcpToolIds(edsProject, ALL_PACKAGES);

        expect(available.has('playwright')).toBe(true);
        expect(available.has('commerce-extensibility')).toBe(true);
    });

    it('omits playwright for an EDS project when @playwright/mcp is not installed', () => {
        const available = resolveAvailableMcpToolIds(edsProject, [
            '@adobe-commerce/commerce-extensibility-tools',
        ]);

        expect(available.has('playwright')).toBe(false);
        expect(available.has('commerce-extensibility')).toBe(true);
    });

    it('is empty for an EDS project with nothing installed', () => {
        expect(resolveAvailableMcpToolIds(edsProject, []).size).toBe(0);
    });

    it('omits playwright for a mesh-only project even when installed (requires eds-storefront)', () => {
        const available = resolveAvailableMcpToolIds(meshOnlyProject, ALL_PACKAGES);

        expect(available.has('playwright')).toBe(false);
        expect(available.has('commerce-extensibility')).toBe(true);
    });

    it('is empty for a bare project even with every package installed (no entry applies)', () => {
        expect(resolveAvailableMcpToolIds(makeProject(), ALL_PACKAGES).size).toBe(0);
    });

    it('matches on package names, not entry ids', () => {
        // A package literally named "playwright" is not @playwright/mcp.
        expect(resolveAvailableMcpToolIds(edsProject, ['playwright']).size).toBe(0);
    });
});

describe('third-party opt-out (the one code point for every seam)', () => {
    const edsProject = makeProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                path: '/p/sf',
            },
        },
    });
    const playwrightEntry = makeEntry({
        id: 'playwright',
        package: '@playwright/mcp',
        version: '~0.0.79',
        args: ['x'],
        description: 'd',
        requires: 'eds-storefront',
        thirdParty: true,
    });
    const adobeEntry = makeEntry({ ...playwrightEntry, id: 'dropins', thirdParty: undefined });

    afterEach(() => setThirdPartyToolsResolver(() => true));

    it('a thirdParty entry stops applying when the setting is off', () => {
        expect(aiDefaultsEntryApplies(playwrightEntry, edsProject)).toBe(true);
        setThirdPartyToolsResolver(() => false);
        expect(aiDefaultsEntryApplies(playwrightEntry, edsProject)).toBe(false);
    });

    it('non-thirdParty entries are untouched by the setting', () => {
        setThirdPartyToolsResolver(() => false);
        expect(aiDefaultsEntryApplies(adobeEntry, edsProject)).toBe(true);
    });

    it('resolveAvailableMcpToolIds drops the tool with the setting — skills gate with it', () => {
        // The bundled ai-defaults flags playwright as thirdParty; with the
        // package installed and the setting OFF, the tool id must vanish,
        // which is what gates the three Playwright-driving skills.
        setThirdPartyToolsResolver(() => false);
        const ids = resolveAvailableMcpToolIds(edsProject, ['@playwright/mcp']);
        expect(ids.has('playwright')).toBe(false);
    });

    it('defaults to enabled when nothing injected the setting', () => {
        const ids = resolveAvailableMcpToolIds(edsProject, ['@playwright/mcp']);
        expect(ids.has('playwright')).toBe(true);
    });
});

/**
 * gatedSkillReasons — why a tool-driving skill the project QUALIFIES for is not
 * there. The AI Capabilities modal renders these, so the distinction between
 * "your setting turned this off" and "the package is not installed yet" is the
 * whole output, not a detail of it.
 *
 * Bound to the REAL ai-defaults.json: `playwright` is the only third-party entry
 * and it requires an EDS storefront.
 */
describe('gatedSkillReasons', () => {
    const PLAYWRIGHT_PKG = '@playwright/mcp';
    const EXTENSIBILITY_PKG = '@adobe-commerce/commerce-extensibility-tools';
    const SCRAPE = { 'scrape-reference-site.md': 'playwright' };

    function edsProject(): Project {
        return makeProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: {
                    id: COMPONENT_IDS.EDS_STOREFRONT,
                    name: 'EDS Storefront',
                    status: 'ready',
                    path: '/projects/demo/storefront',
                },
            },
        });
    }

    function meshOnlyProject(): Project {
        return makeProject({
            componentInstances: {
                [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: {
                    id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
                    name: 'API Mesh',
                    status: 'ready',
                    path: '/projects/demo/mesh',
                },
            },
        });
    }

    afterEach(() => setThirdPartyToolsResolver(() => true));

    it('names the skill, its tool and "tool-missing" when the package is not installed', () => {
        // The extensibility package IS installed — proving the reason is decided by
        // the PLAYWRIGHT entry's package, not by the first entry in ai-defaults.
        const reasons = gatedSkillReasons(edsProject(), [EXTENSIBILITY_PKG], SCRAPE);

        expect(reasons).toEqual([
            {
                file: 'scrape-reference-site.md',
                toolId: 'playwright',
                reason: 'tool-missing',
            },
        ]);
    });

    it('says nothing about a skill whose tool is installed', () => {
        expect(gatedSkillReasons(edsProject(), [PLAYWRIGHT_PKG], SCRAPE)).toEqual([]);
    });

    it('says nothing about a skill whose tool does not apply — that is composition', () => {
        expect(gatedSkillReasons(makeProject(), [], SCRAPE)).toEqual([]);
    });

    it('ignores a dependency naming a tool ai-defaults does not have', () => {
        expect(gatedSkillReasons(edsProject(), [], { 'x.md': 'no-such-tool' })).toEqual([]);
    });

    it('reports every dependent skill of a missing tool', () => {
        const reasons = gatedSkillReasons(
            edsProject(),
            [EXTENSIBILITY_PKG],
            SKILL_MCP_TOOL_DEPENDENCIES
        );

        expect(reasons.map((r) => r.file)).toEqual([
            'scrape-reference-site',
            'connect-authenticated-site',
            'refine-visual-match',
        ]);
        expect(reasons.every((r) => r.reason === 'tool-missing')).toBe(true);
    });

    describe('with third-party tooling switched off', () => {
        beforeEach(() => setThirdPartyToolsResolver(() => false));

        it('says "setting-disabled", not "tool-missing", even with the package installed', () => {
            const reasons = gatedSkillReasons(edsProject(), [PLAYWRIGHT_PKG], SCRAPE);

            expect(reasons).toEqual([
                {
                    file: 'scrape-reference-site.md',
                    toolId: 'playwright',
                    reason: 'setting-disabled',
                },
            ]);
        });

        // The setting only explains an absence the project would otherwise HAVE.
        // Playwright requires a storefront, so a mesh-only project is not missing it.
        it('stays silent when the project would not qualify for the tool anyway', () => {
            expect(gatedSkillReasons(meshOnlyProject(), [PLAYWRIGHT_PKG], SCRAPE)).toEqual([]);
        });

        it('stays silent for a project with no components installed', () => {
            expect(gatedSkillReasons(makeProject(), [PLAYWRIGHT_PKG], SCRAPE)).toEqual([]);
        });

        it('stays silent for a manifest carrying no componentInstances at all', () => {
            const bare = makeProject({ componentInstances: undefined });
            expect(gatedSkillReasons(bare, [PLAYWRIGHT_PKG], SCRAPE)).toEqual([]);
        });
    });
});
