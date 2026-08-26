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
 *    - `diagnose-demo.md` — route a broken-demo symptom to the check that answers it
 *    - `import-datapack.md` — the six-call sample-data loop and its three traps
 *
 * 2. **Adobe skill bundles**: Adobe ships every starter-kit bundle inside the
 *    one `@adobe-commerce/commerce-extensibility-tools` package, which installs
 *    into the project's isolated `.demo-builder-mcp/` dir. Each applicable
 *    bundle is copied from
 *    `<toolsDir>/node_modules/@adobe-commerce/commerce-extensibility-tools/dist/<path>/`
 *    into `<projectPath>/.claude/skills/<prefix>-<skill-name>/`, and each
 *    `*.md` file's `name:` frontmatter is rewritten to match the new folder
 *    name (so colliding skills across bundles stay unique — both bundles ship
 *    a `tester`, which lands as `aem-tester` and `appbuilder-tester`).
 *
 * If the Adobe package isn't installed yet (e.g., npm install hasn't run, or
 * the component lacks a `node_modules`), the bundle copy step is skipped
 * silently — the first-party Demo-Builder skills always succeed.
 *
 * Content sourcing for Demo-Builder skills: static .md files imported at build
 * time (esbuild text loader).
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import addComponentContent from '../../templates/skills/add-component.md';
import commerceBlockMapperContent from '../../templates/skills/commerce-block-mapper.md';
import connectAuthenticatedSiteContent from '../../templates/skills/connect-authenticated-site.md';
import createEdsProjectContent from '../../templates/skills/create-eds-project.md';
import demoDataInjectorContent from '../../templates/skills/demo-data-injector.md';
import diagnoseDemoContent from '../../templates/skills/diagnose-demo.md';
import extendAppBuilderAppContent from '../../templates/skills/extend-app-builder-app.md';
import headerNavFooterContent from '../../templates/skills/header-nav-footer.md';
import importDatapackContent from '../../templates/skills/import-datapack.md';
import refineVisualMatchContent from '../../templates/skills/refine-visual-match.md';
import registerCustomBlockContent from '../../templates/skills/register-custom-block.md';
import removeCustomBlockContent from '../../templates/skills/remove-custom-block.md';
import scrapeReferenceSiteContent from '../../templates/skills/scrape-reference-site.md';
import syncChangesContent from '../../templates/skills/sync-changes.md';
import updateCredentialsContent from '../../templates/skills/update-credentials.md';
import { readInstalledMcpPackages, resolveMcpToolsDir } from './aiDefaultsInstaller';
import {
    projectHasEdsStorefront,
    projectNeedsAppBuilderTooling,
    resolveAvailableMcpToolIds,
} from './aiToolingGate';
import type { GeneratedFileWriter } from './generatedFileWriter';
import { DEMO_BUILDER_ALWAYS_ON_SKILLS, SKILL_MCP_TOOL_DEPENDENCIES } from '@/types/ai';
import type { Project } from '@/types/base';

const ADOBE_PACKAGE_DIST_RELATIVE = path.join(
    'node_modules',
    '@adobe-commerce',
    'commerce-extensibility-tools',
    'dist',
);

/**
 * Content for each always-on skill (filename → static content imported at build
 * time). The LIST of filenames is not defined here — it lives in
 * `DEMO_BUILDER_ALWAYS_ON_SKILLS` (`@/types/ai`), which the skill inspector also
 * reads, so the writer and the classifier cannot disagree about what counts as
 * first-party. A missing key here is a compile error.
 *
 * Delivery of the three Playwright-driven skills is gated per
 * `SKILL_MCP_TOOL_DEPENDENCIES` — they are NOT written into every project.
 * Exported so other writers — notably the single home Chat
 * (`homeAiContextWriter`) — consume the same set without duplicating the import
 * list. Order is not significant.
 *
 * A second docstring used to sit above this one restating the count ("the 13
 * first-party skills"). It was wrong the moment a fourteenth was added, and the
 * paragraph below it already said not to restate counts here. Merged.
 */
const SKILL_CONTENT: Record<(typeof DEMO_BUILDER_ALWAYS_ON_SKILLS)[number], string> = {
    'add-component.md': addComponentContent,
    'sync-changes.md': syncChangesContent,
    'update-credentials.md': updateCredentialsContent,
    'create-eds-project.md': createEdsProjectContent,
    'diagnose-demo.md': diagnoseDemoContent,
    'import-datapack.md': importDatapackContent,
    'scrape-reference-site.md': scrapeReferenceSiteContent,
    'connect-authenticated-site.md': connectAuthenticatedSiteContent,
    'commerce-block-mapper.md': commerceBlockMapperContent,
    'demo-data-injector.md': demoDataInjectorContent,
    'header-nav-footer.md': headerNavFooterContent,
    'refine-visual-match.md': refineVisualMatchContent,
    'register-custom-block.md': registerCustomBlockContent,
    'remove-custom-block.md': removeCustomBlockContent,
};

export const DEMO_BUILDER_SKILLS: ReadonlyArray<{ filename: string; content: string }> =
    DEMO_BUILDER_ALWAYS_ON_SKILLS.map((filename) => ({
        filename,
        content: SKILL_CONTENT[filename],
    }));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write skill files to `{projectPath}/.claude/skills/`.
 *
 * Writes the first-party set declared in `DEMO_BUILDER_ALWAYS_ON_SKILLS`
 * (`@/types/ai` — the ONE home for the filenames; do not restate counts here,
 * they rot). Three of those skills drive Playwright and are delivery-gated
 * per `SKILL_MCP_TOOL_DEPENDENCIES` — see the gating paragraph below.
 *
 * Additionally copies the Adobe skill bundles the project qualifies for:
 * `aem-boilerplate-commerce` for an EDS storefront, `integration-starter-kit`
 * for App Builder-adjacent projects. Both come from the isolated MCP tools
 * dir, so the installer must run before this writer (it does, on the creation
 * and regenerate paths alike).
 *
 * Every skill file — always-on, conditional, and Adobe bundle copies alike —
 * lands through the ADR-013 GeneratedFileWriter seam (hash-and-skip): a
 * user-edited skill is left in place and reported on `writer.report()`
 * rather than overwritten. No bundle write outside this seam. The `written`
 * return keeps its pre-ADR contract (the attempted Demo-Builder skill
 * filenames); skip/remove visibility lives on the writer's report.
 *
 * Tool-availability gating: a skill in `SKILL_MCP_TOOL_DEPENDENCIES` whose
 * MCP tool is not usable by this project — the ai-defaults entry doesn't
 * apply, or its package isn't in the isolated `.demo-builder-mcp` manifest
 * (installed by `installAiDefaultsMcpTools` BEFORE this writer runs, on both
 * the creation and regenerate paths — that ordering is load-bearing) — is
 * not written and does not appear in `written`. A previously-delivered copy
 * is reconciled via `writer.remove` with today's template as the ownership
 * proof (ADR-013 removal matrix: recorded-hash match or byte-equal only; a
 * user-edited copy is left and reported). `DEMO_BUILDER_ALWAYS_ON_SKILLS`
 * stays the classifier list — a gated-out skill found on disk still
 * classifies as first-party in the inspector; only delivery is filtered.
 */
export async function writeSkillFiles(
    projectPath: string,
    project: Project,
    writer: GeneratedFileWriter,
): Promise<{ written: string[] }> {
    const skillsDir = path.join(projectPath, '.claude', 'skills');
    await fsPromises.mkdir(skillsDir, { recursive: true });

    const writeSkill = async (filename: string, content: string): Promise<void> => {
        if (path.basename(filename) !== filename) {
            throw new Error(`Invalid skill filename: ${filename}`);
        }
        await writer.write(`.claude/skills/${filename}`, content);
    };

    const installedPackages = await readInstalledMcpPackages(projectPath);
    const gatedOut = gatedOutSkills(resolveAvailableMcpToolIds(project, installedPackages));

    await Promise.all(
        DEMO_BUILDER_SKILLS.map(({ filename, content }) =>
            gatedOut.has(filename)
                ? // Reconcile any previously-delivered copy. `content` is the
                  // exact template we'd write today, so a pre-ADR unhashed
                  // copy is removed only when byte-equal (provably ours).
                  writer.remove(`.claude/skills/${filename}`, content)
                : writeSkill(filename, content),
        ),
    );

    // aem-boilerplate-commerce skills (block-developer, content-modeler,
    // dropin-developer, project-manager, researcher, tester) — Adobe ships all
    // of its starter-kit bundles inside ONE package, so this reads from the
    // isolated MCP tools dir like the integration kit below, NOT from the
    // storefront checkout. The storefront IS @adobe/aem-boilerplate-commerce
    // and carries no skills/ directory of its own; the old component-declared
    // `aiSkillBundle` pointed there and silently ENOENT-skipped every time.
    if (projectHasEdsStorefront(project)) {
        await copyAdobeSkillBundle(
            resolveMcpToolsDir(projectPath),
            path.join('aem-boilerplate-commerce', 'skills'),
            'aem',
            writer,
        );
    }

    // App Builder-adjacent projects (mesh or attached App Builder component,
    // with or without a storefront) also get the Developer Agent's
    // integration-starter-kit skills, sourced from the isolated MCP tools dir
    // (`.demo-builder-mcp/` — installed by installAiDefaultsMcpTools before
    // this writer runs, on both the creation and regenerate paths) — plus the
    // extend-app-builder-app skill teaching the runtime API-access loop
    // (list_console_apis → confirm → add_console_apis → build → deploy).
    // copyAdobeSkillBundle skips silently when the package isn't there.
    const written = DEMO_BUILDER_SKILLS.filter(({ filename }) => !gatedOut.has(filename)).map(
        ({ filename }) => filename,
    );
    if (projectNeedsAppBuilderTooling(project)) {
        await copyAdobeSkillBundle(
            resolveMcpToolsDir(projectPath),
            path.join('integration-starter-kit', 'skills'),
            'appbuilder',
            writer,
        );
        await writeSkill('extend-app-builder-app.md', extendAppBuilderAppContent);
        written.push('extend-app-builder-app.md');
    }

    // Summary for the handler boundary to log (Adobe bundle skills are copied
    // into subdirectories and aren't included here — only the written
    // Demo-Builder skill filenames).
    return { written };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Always-on skill filenames whose declared MCP tool is not in the available
 * set — gated OUT of delivery (not written; existing copies reconciled via
 * the ADR-013 removal matrix). A skill absent from
 * `SKILL_MCP_TOOL_DEPENDENCIES` depends on no tool and is never gated.
 */
function gatedOutSkills(availableToolIds: Set<string>): Set<string> {
    return new Set(
        Object.entries(SKILL_MCP_TOOL_DEPENDENCIES)
            .filter(([, toolId]) => !availableToolIds.has(toolId))
            .map(([filename]) => filename),
    );
}

async function copyAdobeSkillBundle(
    toolsDir: string,
    bundleSubpath: string,
    prefix: string,
    writer: GeneratedFileWriter,
): Promise<void> {
    const sourceBundle = path.join(toolsDir, ADOBE_PACKAGE_DIST_RELATIVE, bundleSubpath);

    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
        entries = await fsPromises.readdir(sourceBundle, { withFileTypes: true });
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            // Bundle not present — the tools install hasn't run yet, or this
            // version of the Adobe package doesn't ship this bundle. Skip; the
            // Demo-Builder skills already wrote successfully.
            return;
        }
        throw err;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillName = entry.name;
        const newSkillName = `${prefix}-${skillName}`;
        const sourceSkillDir = path.join(sourceBundle, skillName);
        // Project-relative posix target — the seam resolves it against the
        // project root and mkdirs on actual writes.
        const targetRelDir = `.claude/skills/${newSkillName}`;
        await copySkillFolder(sourceSkillDir, targetRelDir, newSkillName, writer);
    }
}

/**
 * Copy one skill folder from an Adobe bundle into the project, file by file
 * through the ADR-013 seam. `targetRelDir` is a posix project-relative path;
 * `.md` files get their `name:` frontmatter rewritten to the prefixed folder
 * name before landing.
 */
async function copySkillFolder(
    sourceDir: string,
    targetRelDir: string,
    newName: string,
    writer: GeneratedFileWriter,
): Promise<void> {
    const entries = await fsPromises.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetRelPath = `${targetRelDir}/${entry.name}`;

        if (entry.isDirectory()) {
            await copySkillFolder(sourcePath, targetRelPath, newName, writer);
            continue;
        }

        const raw = await fsPromises.readFile(sourcePath, 'utf-8');
        const content = entry.name.endsWith('.md') ? rewriteNameFrontmatter(raw, newName) : raw;
        await writer.write(targetRelPath, content);
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
        parsed = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
    } catch {
        return content;
    }
    if (!('name' in parsed)) return content;

    parsed.name = newName;
    const serialized = yaml.stringify(parsed).trimEnd();
    return `---\n${serialized}\n---\n${body}`;
}
