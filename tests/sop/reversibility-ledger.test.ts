/**
 * Every create-shaped capability names its reversal, or says why it has none.
 *
 * WHY THIS EXISTS. `CLAUDE.md` opens its never-compromise list with this:
 *
 *   "Whatever can be done can be undone. New capabilities ship with their reversal —
 *    create/delete, deploy/undeploy, install/uninstall — or they state plainly why
 *    reversal is impossible. A thing that cannot be undone is a finding."
 *
 * Until 2026-09-10 nothing checked it. The handbook stated 112 conventions, all 112
 * enforced, and not one of them was this — so the rule stated most loudly, in the file
 * loaded into every session, was the one with no enforcement, while `!important` in a
 * stylesheet had three. Found by PL-55, which compared the conventions against an
 * independent list of what the codebase says it cares about, because a convention count
 * cannot report its own gaps.
 *
 * WHY THE AGENT SURFACE. It is the only fully enumerable list of capabilities in the
 * repo: every tool is declared as `registerTool('name', …)` or a `{ tool: 'name', … }`
 * row, so "every capability" is something a script can build. The human surface has no
 * equivalent — a button is a React element and no file names them all — so this rules
 * the half that can be ruled rather than guessing at the half that cannot.
 *
 * WHY A LEDGER AND NOT A NAMING RULE. Measured before choosing: a rule inferring
 * `delete_x` from `create_x` flags ten tools, and at least three of those ARE
 * reversible under a different verb — `deploy_mesh` by `delete_mesh`,
 * `deploy_integration` by `remove_integration`, `publish_page` by `delete_page`. A rule
 * that fires on correct code teaches people to ignore it.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT. It proves the question was ANSWERED for every
 * create-shaped tool, that every named reversal is a tool that really exists, and that
 * the set of unanswered ones cannot grow silently. It does NOT prove a reversal works —
 * AB-7 is an open defect where `remove_integration` reported success while leaving
 * deployed code running, and this suite would not have caught it. Reversal correctness
 * needs a live test; reversal EXISTENCE is what is checkable here.
 *
 * @see tests/sop/tool.testUtils.ts — the shared surface reader, reused rather than
 *      rebuilt; a hand-rolled second walker read one directory and missed nine tools
 * @see .rptc/backlog/2026-09-10-architecture-conventions-never-written.md — PL-55
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { toolDeclarations } from './tool.testUtils';

const LEDGER = JSON.parse(readFileSync(join(__dirname, 'reversibility.ledger.json'), 'utf8')) as {
    openReasonCeiling: number;
    entries: { tool: string; reverses?: string; reason?: string; note?: string }[];
};

/**
 * Verb stems that CREATE or acquire something. Used only to decide which tools owe an
 * answer — never to infer what the answer is.
 */
const CREATE_VERBS = [
    'create',
    'deploy',
    'install',
    'add',
    'register',
    'publish',
    'attach',
    'start',
    'grant',
    'connect',
];

const isCreateShaped = (n: string): boolean => CREATE_VERBS.some((v) => n.startsWith(`${v}_`));

const TOOLS = toolDeclarations().map((d) => d.name);
const TOOL_SET = new Set(TOOLS);
const createShaped = [...new Set(TOOLS.filter(isCreateShaped))].sort();
const byTool = new Map(LEDGER.entries.map((e) => [e.tool, e]));

describe('a capability that creates something can be undone, or says why not', () => {
    it('CONTROL: the tool surface is read, and read WHOLE', () => {
        // A zero here, or a partial read, would make every assertion below vacuous.
        // The count is not pinned — tools are added often — but the shape is.
        expect(TOOLS.length).toBeGreaterThan(90);
        // One tool from EACH registration form, so a regression to reading only one
        // form fails here rather than silently shrinking the population.
        expect(TOOL_SET.has('get_auth_status')).toBe(true); // registerTool(...)
        expect(TOOL_SET.has('deploy_mesh')).toBe(true); // { tool: ... } row
    });

    it('CONTROL: the create-verb filter selects and rejects the right shapes', () => {
        expect(isCreateShaped('create_project')).toBe(true);
        expect(isCreateShaped('deploy_mesh')).toBe(true);
        // A read is not a create, and neither is a removal.
        expect(isCreateShaped('get_auth_status')).toBe(false);
        expect(isCreateShaped('delete_mesh')).toBe(false);
        // Not a prefix match on a longer word: `startup_probe` is not `start_`.
        expect(isCreateShaped('startup_probe')).toBe(false);
    });

    it('every create-shaped tool has a ledger row', () => {
        const missing = createShaped.filter((t) => !byTool.has(t));
        // Adding a capability means answering the question: name the tool that undoes
        // it, or write why nothing can. See reversibility.ledger.json.
        expect(missing).toStrictEqual([]);
    });

    it('every row answers with either a reversal or a reason', () => {
        const silent = LEDGER.entries.filter((e) => !e.reverses && !e.reason).map((e) => e.tool);
        expect(silent).toStrictEqual([]);
    });

    it('every named reversal is a tool that actually exists', () => {
        // A row pointing at a tool nobody registered is worse than no row: it reads as
        // an answer. This is what goes stale when a tool is renamed.
        const dangling = LEDGER.entries
            .filter((e) => e.reverses && !TOOL_SET.has(e.reverses))
            .map((e) => `${e.tool} -> ${e.reverses}`);
        expect(dangling).toStrictEqual([]);
    });

    it('the ledger describes tools that still exist', () => {
        const gone = LEDGER.entries.filter((e) => !TOOL_SET.has(e.tool)).map((e) => e.tool);
        // A row for a deleted tool is rot, and it hides that the population shrank.
        expect(gone).toStrictEqual([]);
    });

    it('the number of capabilities with NO reversal only falls', () => {
        // The debt, pinned. A `reason` is an honest record of a gap, not a resolution —
        // without a ceiling, "state why not" becomes the cheap path and the principle
        // erodes one well-written excuse at a time.
        const open = LEDGER.entries.filter((e) => !e.reverses).map((e) => e.tool);
        expect(open.length).toBeLessThanOrEqual(LEDGER.openReasonCeiling);
    });
});
