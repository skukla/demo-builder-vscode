/**
 * Skills Writer
 *
 * Writes AI skill files to {projectPath}/.claude/skills/.
 * Skills are procedural guides that tell AI agents how to perform common operations
 * on Demo Builder projects (sync content, edit blocks, update credentials, etc.).
 *
 * Content sourcing: static .md files imported at build time (esbuild text loader).
 * Template .md.template files have {placeholder} tokens interpolated per-project.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import addBlockContent from '../templates/skills/add-block.md';
import addComponentContent from '../templates/skills/add-component.md';
import addCustomBlockContent from '../templates/skills/add-custom-block.md';
import configureEdsContent from '../templates/skills/configure-eds.md';
import createBlockContent from '../templates/skills/create-block.md';
import editBlockLibTemplate from '../templates/skills/edit-block-library.md.template';
import modifyContentContent from '../templates/skills/modify-content.md';
import syncChangesContent from '../templates/skills/sync-changes.md';
import updateCredentialsContent from '../templates/skills/update-credentials.md';
import updateStylesContent from '../templates/skills/update-styles.md';
import useAemContentMcpTemplate from '../templates/skills/use-aem-content-mcp.md.template';
import useCommerceMcpTemplate from '../templates/skills/use-commerce-dev-mcp.md.template';
import useDaLiveMcpTemplate from '../templates/skills/use-da-live-mcp.md.template';
import { sanitizeTemplateValue, sanitizeGithubSlug, sanitizeUrl, sanitizeBlockId } from './sanitization';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { isEdsProject } from '@/types/typeGuards';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SkillsSettings {
    /** Which external MCP servers are enabled (determines which MCP usage skills to write) */
    externalMcpServers: string[];
    /** Whether to include boilerplate EDS skills (add-block, create-block, etc.) */
    includeBoilerplateSkills: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write skill files to {projectPath}/.claude/skills/.
 */
export async function writeSkillFiles(
    projectPath: string,
    project: Project,
    settings: SkillsSettings,
): Promise<void> {
    const skillsDir = path.join(projectPath, '.claude', 'skills');
    await fsPromises.mkdir(skillsDir, { recursive: true });

    const write = async (filename: string, content: string): Promise<void> => {
        if (path.basename(filename) !== filename) {
            throw new Error(`Invalid skill filename: ${filename}`);
        }
        await fsPromises.writeFile(path.join(skillsDir, filename), content, 'utf-8');
    };

    const eds = isEdsProject(project);
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const storefrontPath = sanitizeTemplateValue(edsInstance?.path ?? '');

    const writes: Promise<void>[] = [];

    // ── Core skills (all projects) ───────────────────────────────────────────
    writes.push(write('add-component.md', addComponentContent));
    writes.push(write('update-credentials.md', updateCredentialsContent));
    writes.push(write('sync-changes.md', syncChangesContent));

    // ── EDS-specific skills ──────────────────────────────────────────────────
    if (eds) {
        writes.push(write('add-custom-block.md', addCustomBlockContent));
        writes.push(write('configure-eds.md', configureEdsContent));

        // edit-block-library.md is per-project (contains library list)
        const installedLibs = project.installedBlockLibraries ?? [];
        if (installedLibs.length > 0) {
            const libraryList = buildLibraryList(installedLibs, storefrontPath);
            const editBlockLibContent = editBlockLibTemplate
                .replace(/\{libraryList\}/g, libraryList)
                .replace(/\{storefrontLocalPath\}/g, storefrontPath);
            writes.push(write('edit-block-library.md', editBlockLibContent));
        }
    }

    // ── Boilerplate EDS skills ───────────────────────────────────────────────
    if (eds && settings.includeBoilerplateSkills) {
        writes.push(write('add-block.md', addBlockContent));
        writes.push(write('create-block.md', createBlockContent));
        writes.push(write('update-styles.md', updateStylesContent));
        writes.push(write('modify-content.md', modifyContentContent));
    }

    // ── MCP usage skills (per enabled MCP) ──────────────────────────────────
    for (const serverId of settings.externalMcpServers) {
        const skill = buildMcpSkill(serverId, project);
        if (skill) {
            writes.push(write(skill.filename, skill.content));
        }
    }

    await Promise.all(writes);
}

// ─── Private types ────────────────────────────────────────────────────────────

interface McpSkill {
    filename: string;
    content: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

// All values are sanitized before interpolation — see ./sanitization for the threat model.
// GitHub owner/repo values are double-sanitized: sanitizeTemplateValue first (strips Markdown
// control characters), then sanitizeGithubSlug (enforces the slug allowlist). Both layers
// are intentional — sanitizeGithubSlug's allowlist alone is sufficient, but the layering
// provides defense-in-depth and makes the sanitization intent explicit at each call site.

function buildLibraryList(libs: InstalledBlockLibrary[], storefrontPath: string): string {
    if (libs.length === 0) return '(none installed)';
    return libs
        .map(lib => {
            const owner = sanitizeGithubSlug(sanitizeTemplateValue(lib.source.owner));
            const repo = sanitizeGithubSlug(sanitizeTemplateValue(lib.source.repo));
            const githubUrl = `https://github.com/${owner}/${repo}`;
            const blockList = lib.blockIds.map(id => sanitizeBlockId(id)).join(', ');
            const name = sanitizeTemplateValue(lib.name);
            const commitSha = sanitizeTemplateValue(lib.commitSha);
            return (
                `### ${name}\n` +
                `- **Source:** ${githubUrl}\n` +
                `- **Blocks:** ${blockList}\n` +
                `- **Installed from commit:** ${commitSha}\n` +
                `- **Local blocks directory:** ${storefrontPath}/blocks/`
            );
        })
        .join('\n\n');
}

function buildMcpSkill(serverId: string, project: Project): McpSkill | null {
    // Extract all substitution values up-front so each switch branch stays readable.
    // Only a subset is used per branch, but the extraction cost is negligible.
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const daLiveOrg = sanitizeTemplateValue((edsInstance?.metadata?.daLiveOrg as string | undefined) ?? '');
    const daLiveSite = sanitizeTemplateValue((edsInstance?.metadata?.daLiveSite as string | undefined) ?? '');
    const commerceUrl = sanitizeUrl(project.commerce?.instance?.url ?? '');
    const storeViewCode = sanitizeTemplateValue(project.commerce?.instance?.storeView ?? '');

    switch (serverId) {
        case 'da-live':
            return {
                filename: 'use-da-live-mcp.md',
                content: useDaLiveMcpTemplate
                    .replace(/\{daLiveOrg\}/g, daLiveOrg)
                    .replace(/\{daLiveSite\}/g, daLiveSite),
            };
        case 'aem-content':
            return {
                filename: 'use-aem-content-mcp.md',
                content: useAemContentMcpTemplate,
            };
        case 'adobe-commerce-dev':
            return {
                filename: 'use-commerce-dev-mcp.md',
                content: useCommerceMcpTemplate
                    .replace(/\{commerceEndpoint\}/g, commerceUrl)
                    .replace(/\{storeViewCode\}/g, storeViewCode),
            };
        default:
            return null;
    }
}
