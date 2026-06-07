/**
 * Skills Writer
 *
 * Writes skill files to `{projectPath}/.claude/skills/`. Two sources:
 *
 * 1. **Demo Builder lifecycle skills** (always written): procedural guides
 *    that tell AI agents how to operate against the Demo Builder MCP server.
 *    - `add-component.md` — add or enable a component via update_project_config
 *    - `sync-changes.md` — push code changes via sync_storefront
 *    - `update-credentials.md` — edit .env credentials via update_project_config
 *    - `create-eds-project.md` — provision a new project headlessly via create_project
 *
 * 2. **Adobe skill bundles** (component-driven): each `RawComponentDefinition`
 *    may declare `aiSkillBundle: { path, prefix }`. The bundle is copied from
 *    `<componentPath>/node_modules/@adobe-commerce/commerce-extensibility-tools/dist/<path>/`
 *    into `<projectPath>/.claude/skills/<prefix>-<skill-name>/`, and each
 *    `*.md` file's `name:` frontmatter is rewritten to match the new folder
 *    name (so colliding skills across bundles stay unique).
 *
 * If the Adobe package isn't installed yet (e.g., npm install hasn't run, or
 * the component lacks a `node_modules`), the bundle copy step is skipped
 * silently — the three Demo-Builder skills always succeed.
 *
 * Content sourcing for Demo-Builder skills: static .md files imported at build
 * time (esbuild text loader).
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import addComponentContent from '../templates/skills/add-component.md';
import commerceBlockMapperContent from '../templates/skills/commerce-block-mapper.md';
import connectAuthenticatedSiteContent from '../templates/skills/connect-authenticated-site.md';
import createEdsProjectContent from '../templates/skills/create-eds-project.md';
import demoDataInjectorContent from '../templates/skills/demo-data-injector.md';
import headerNavFooterContent from '../templates/skills/header-nav-footer.md';
import refineVisualMatchContent from '../templates/skills/refine-visual-match.md';
import registerCustomBlockContent from '../templates/skills/register-custom-block.md';
import removeCustomBlockContent from '../templates/skills/remove-custom-block.md';
import scrapeReferenceSiteContent from '../templates/skills/scrape-reference-site.md';
import syncChangesContent from '../templates/skills/sync-changes.md';
import updateCredentialsContent from '../templates/skills/update-credentials.md';
import componentsConfig from '@/features/components/config/components.json';
import type { Project } from '@/types/base';
import type { RawComponentDefinition, RawComponentRegistry } from '@/types/components';

const ADOBE_PACKAGE_DIST_RELATIVE = path.join(
    'node_modules',
    '@adobe-commerce',
    'commerce-extensibility-tools',
    'dist',
);

const COMPONENT_CATEGORIES = [
    'frontends',
    'backends',
    'mesh',
    'dependencies',
    'appBuilderApps',
    'integrations',
    'infrastructure',
    'tools',
] as const;

const components = componentsConfig as unknown as RawComponentRegistry;

/**
 * The twelve Demo-Builder skills written into every project's
 * `.claude/skills/` directory (filename → static content imported at build
 * time). Exported so other writers — notably the single home Chat
 * (`homeAiContextWriter`) — can write the exact same set without duplicating
 * the import list. Order is not significant.
 */
export const DEMO_BUILDER_SKILLS: ReadonlyArray<{ filename: string; content: string }> = [
    // Demo Builder lifecycle skills
    { filename: 'add-component.md', content: addComponentContent },
    { filename: 'sync-changes.md', content: syncChangesContent },
    { filename: 'update-credentials.md', content: updateCredentialsContent },
    { filename: 'create-eds-project.md', content: createEdsProjectContent },
    // EDS site-scraping skills
    { filename: 'scrape-reference-site.md', content: scrapeReferenceSiteContent },
    { filename: 'connect-authenticated-site.md', content: connectAuthenticatedSiteContent },
    { filename: 'commerce-block-mapper.md', content: commerceBlockMapperContent },
    { filename: 'demo-data-injector.md', content: demoDataInjectorContent },
    { filename: 'header-nav-footer.md', content: headerNavFooterContent },
    { filename: 'refine-visual-match.md', content: refineVisualMatchContent },
    // Custom block authoring registration
    { filename: 'register-custom-block.md', content: registerCustomBlockContent },
    { filename: 'remove-custom-block.md', content: removeCustomBlockContent },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write skill files to `{projectPath}/.claude/skills/`.
 *
 * Always writes:
 *   - Four Demo-Builder lifecycle skills (add-component, sync-changes,
 *     update-credentials, create-eds-project) — operating against the Demo
 *     Builder MCP server.
 *   - Six EDS site-scraping skills (scrape-reference-site,
 *     connect-authenticated-site, commerce-block-mapper, demo-data-injector,
 *     header-nav-footer, refine-visual-match). They sit alongside the
 *     lifecycle skills because they're invoked from any project state; the
 *     `scrape-reference-site` orchestrator routes between Mod Agent and
 *     Playwright MCP based on user choice.
 *   - Two custom-block authoring skills: register-custom-block (calls
 *     `promote_block_to_library` to make a new block show up in DA.live's
 *     authoring picker) and remove-custom-block (calls
 *     `remove_block_from_library` to unregister it again).
 *
 * Additionally copies any Adobe skill bundles declared by components in
 * `project.componentInstances` (via the `aiSkillBundle` field on the
 * component's definition).
 */
export async function writeSkillFiles(
    projectPath: string,
    project: Project,
): Promise<void> {
    const skillsDir = path.join(projectPath, '.claude', 'skills');
    await fsPromises.mkdir(skillsDir, { recursive: true });

    const writeSkill = async (filename: string, content: string): Promise<void> => {
        if (path.basename(filename) !== filename) {
            throw new Error(`Invalid skill filename: ${filename}`);
        }
        await fsPromises.writeFile(path.join(skillsDir, filename), content, 'utf-8');
    };

    await Promise.all(
        DEMO_BUILDER_SKILLS.map(({ filename, content }) => writeSkill(filename, content)),
    );

    // Copy Adobe skill bundles for components that declare aiSkillBundle.
    const componentInstances = project.componentInstances ?? {};
    for (const [compId, instance] of Object.entries(componentInstances)) {
        const definition = lookupComponentDefinition(compId);
        if (!definition?.aiSkillBundle) continue;
        if (!instance.path) continue;

        await copyAdobeSkillBundle(
            instance.path,
            definition.aiSkillBundle.path,
            definition.aiSkillBundle.prefix,
            skillsDir,
        );
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function lookupComponentDefinition(compId: string): RawComponentDefinition | undefined {
    const registry = components as unknown as Record<string, Record<string, RawComponentDefinition>>;
    for (const category of COMPONENT_CATEGORIES) {
        const group = registry[category];
        if (group && typeof group === 'object' && compId in group) {
            return group[compId];
        }
    }
    return undefined;
}

async function copyAdobeSkillBundle(
    componentPath: string,
    bundleSubpath: string,
    prefix: string,
    skillsDir: string,
): Promise<void> {
    const sourceBundle = path.join(componentPath, ADOBE_PACKAGE_DIST_RELATIVE, bundleSubpath);

    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
        entries = await fsPromises.readdir(sourceBundle, { withFileTypes: true });
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            // Bundle not present (e.g., npm install hasn't run yet, or this
            // component doesn't have the Adobe package). Skip silently — the
            // three Demo-Builder skills already wrote successfully.
            return;
        }
        throw err;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillName = entry.name;
        const newSkillName = `${prefix}-${skillName}`;
        const sourceSkillDir = path.join(sourceBundle, skillName);
        const targetSkillDir = path.join(skillsDir, newSkillName);
        await copySkillFolder(sourceSkillDir, targetSkillDir, newSkillName);
    }
}

async function copySkillFolder(
    sourceDir: string,
    targetDir: string,
    newName: string,
): Promise<void> {
    await fsPromises.mkdir(targetDir, { recursive: true });

    const entries = await fsPromises.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            await copySkillFolder(sourcePath, targetPath, newName);
            continue;
        }

        const raw = await fsPromises.readFile(sourcePath, 'utf-8');
        const content = entry.name.endsWith('.md')
            ? rewriteNameFrontmatter(raw, newName)
            : raw;
        await fsPromises.writeFile(targetPath, content, 'utf-8');
    }
}

/**
 * If `content` opens with a YAML frontmatter block containing a `name:` field,
 * rewrite that field to `newName` and return the updated content. Otherwise,
 * return `content` unchanged.
 */
function rewriteNameFrontmatter(content: string, newName: string): string {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
    if (!match) return content;

    const [, frontmatterRaw, body] = match;
    let parsed: Record<string, unknown>;
    try {
        const result = yaml.parse(frontmatterRaw) as unknown;
        parsed = (result && typeof result === 'object' ? (result as Record<string, unknown>) : {});
    } catch {
        return content;
    }
    if (!('name' in parsed)) return content;

    parsed.name = newName;
    const serialized = yaml.stringify(parsed).trimEnd();
    return `---\n${serialized}\n---\n${body}`;
}
