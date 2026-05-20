/**
 * Skills Writer
 *
 * Writes Demo-Builder-specific skill files to `{projectPath}/.claude/skills/`.
 * Skills are procedural guides that tell AI agents how to perform project-
 * lifecycle operations using the Demo Builder MCP server.
 *
 * Three skills ship today:
 * - `add-component.md` — add or enable a component via update_project_config
 * - `sync-changes.md` — push code changes via sync_storefront
 * - `update-credentials.md` — edit .env credentials via update_project_config
 *
 * EDS storefront skills (block development, drop-in customization, content
 * modeling) come from Adobe's official `@adobe-commerce/commerce-extensibility-tools`
 * package, installed per-project in Cycle B. MCP-usage skills (DA.live, AEM
 * Content, Commerce) are unnecessary because those MCPs live in Claude Code's
 * session-level catalog and document themselves.
 *
 * Content sourcing: static .md files imported at build time (esbuild text loader).
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import addComponentContent from '../templates/skills/add-component.md';
import syncChangesContent from '../templates/skills/sync-changes.md';
import updateCredentialsContent from '../templates/skills/update-credentials.md';
import type { Project } from '@/types/base';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write skill files to `{projectPath}/.claude/skills/`.
 *
 * Writes the same three Demo-Builder-specific skills for every project,
 * regardless of stack — they target the seven Demo Builder MCP tools, which
 * apply equally to EDS and headless projects.
 */
export async function writeSkillFiles(
    projectPath: string,
    project: Project,
): Promise<void> {
    // project is accepted for API symmetry with the other writers and to
    // leave room for future per-project skill customization. Currently unused
    // because all three skills are static.
    void project;

    const skillsDir = path.join(projectPath, '.claude', 'skills');
    await fsPromises.mkdir(skillsDir, { recursive: true });

    const write = async (filename: string, content: string): Promise<void> => {
        if (path.basename(filename) !== filename) {
            throw new Error(`Invalid skill filename: ${filename}`);
        }
        await fsPromises.writeFile(path.join(skillsDir, filename), content, 'utf-8');
    };

    await Promise.all([
        write('add-component.md', addComponentContent),
        write('sync-changes.md', syncChangesContent),
        write('update-credentials.md', updateCredentialsContent),
    ]);
}
