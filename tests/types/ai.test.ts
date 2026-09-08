/**
 * The skill declarations in `@/types/ai` — the two lists and the map.
 *
 * `SKILL_MCP_TOOL_DEPENDENCIES` is the machine-readable skill→tool link. Before
 * 2026-08-14 that relationship existed only as prose inside skill bodies, so "if
 * the user opts out of a tool, which skills are disabled?" had no answer the code
 * could act on. `DEMO_BUILDER_SKILL_NAMES` is the classifier that decides whether
 * a skill found on a project's disk is first-party at all.
 *
 * Both are held against reality here rather than merely read: the map against
 * `ai-defaults.json` and the template bodies on disk, the set against the two
 * lists it is spread from.
 */

import * as fs from 'fs';
import * as path from 'path';
import aiDefaults from '@/features/project-creation/config/ai-defaults.json';
import {
    DEMO_BUILDER_ALWAYS_ON_SKILLS,
    DEMO_BUILDER_CONDITIONAL_SKILLS,
    DEMO_BUILDER_SKILL_NAMES,
    SKILL_MCP_TOOL_DEPENDENCIES,
} from '@/types/ai';

const TEMPLATES_DIR = path.join(
    __dirname,
    '..',
    '..',
    'src',
    'features',
    'project-creation',
    'templates',
    'skills'
);

/** A body "drives Playwright" when it instructs tool use, not merely names it. */
function instructsPlaywright(body: string): boolean {
    return /playwright|browser_(navigate|snapshot|take_screenshot|evaluate|network_requests)/i.test(
        body
    );
}

describe('SKILL_MCP_TOOL_DEPENDENCIES', () => {
    it('declares only real ai-defaults entry ids (the map cannot import the JSON)', () => {
        const knownIds = aiDefaults.mcpServers.map((entry) => entry.id);
        for (const toolId of Object.values(SKILL_MCP_TOOL_DEPENDENCIES)) {
            expect(knownIds).toContain(toolId);
        }
    });

    it('declares only real always-on skill filenames', () => {
        for (const file of Object.keys(SKILL_MCP_TOOL_DEPENDENCIES)) {
            expect(DEMO_BUILDER_ALWAYS_ON_SKILLS).toContain(file);
        }
    });

    it('every template that instructs Playwright use is declared, and vice versa', () => {
        // Positive control first: the sweep below proves nothing if the
        // classifier never fires, so pin one known-driving template.
        const control = fs.readFileSync(
            path.join(TEMPLATES_DIR, 'connect-authenticated-site.md'),
            'utf-8'
        );
        expect(instructsPlaywright(control)).toBe(true);

        const declared = new Set(
            Object.entries(SKILL_MCP_TOOL_DEPENDENCIES)
                .filter(([, toolId]) => toolId === 'playwright')
                .map(([file]) => file)
        );

        for (const file of DEMO_BUILDER_ALWAYS_ON_SKILLS) {
            // The canonical list holds bare skill NAMES (v27); templates stay flat .md files.
            const body = fs.readFileSync(path.join(TEMPLATES_DIR, `${file}.md`), 'utf-8');
            const drives = instructsPlaywright(body);
            const isDeclared = declared.has(file);
            if (drives !== isDeclared) {
                throw new Error(
                    `${file}: template ${drives ? 'instructs' : 'does not instruct'} Playwright ` +
                        `but is ${isDeclared ? '' : 'not '}declared in SKILL_MCP_TOOL_DEPENDENCIES — ` +
                        'update the map in src/types/ai.ts to match the skill body.'
                );
            }
        }
    });
});

describe('DEMO_BUILDER_SKILL_NAMES', () => {
    it('classifies every always-on skill', () => {
        for (const name of DEMO_BUILDER_ALWAYS_ON_SKILLS) {
            expect(DEMO_BUILDER_SKILL_NAMES.has(name)).toBe(true);
        }
    });

    it('classifies every conditional skill — conditional delivery is still first-party', () => {
        for (const name of DEMO_BUILDER_CONDITIONAL_SKILLS) {
            expect(DEMO_BUILDER_SKILL_NAMES.has(name)).toBe(true);
        }
    });

    it('holds exactly the two source lists and nothing else', () => {
        // Membership alone would pass on a set that also carried names no list
        // declares; the size pins the other direction.
        expect([...DEMO_BUILDER_SKILL_NAMES].sort()).toStrictEqual(
            [...DEMO_BUILDER_ALWAYS_ON_SKILLS, ...DEMO_BUILDER_CONDITIONAL_SKILLS].sort()
        );
    });

    it('is non-empty — an empty classifier reports every skill as third-party', () => {
        expect(DEMO_BUILDER_SKILL_NAMES.size).toBeGreaterThan(0);
    });
});
