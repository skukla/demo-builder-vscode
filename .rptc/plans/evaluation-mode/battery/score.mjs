/**
 * Scoring, in its own module so the test IMPORTS it rather than copying it.
 *
 * The test used to carry a copy extracted from `run.mjs` at authoring time. On
 * 2026-08-26 the scorer was fixed to treat an error returned as PROSE as a
 * failure, and the test kept passing against the old copy — a test that agrees
 * with itself and not with the code.
 */

/**
 * Strip ANY server's MCP prefix so a route reads as tool names.
 *
 * It used to strip `mcp__demo-builder__` only — written when demo-builder was the
 * only server the battery allowed. Once a prompt could expect another server's
 * tool it silently mis-scored: `cross-pdp-slots` expects `list_slots`, the agent
 * called `mcp__dropins__list_slots` on its FIRST call, and the run scored
 * `NOT-FINDABLE` — "the agent could not find the tool" about a tool it went
 * straight to. The `servers: want dropins · got dropins` line on the same output
 * said the opposite.
 */
const bare = (n) => n.replace(/^mcp__[^_]+(?:[^_]|_(?!_))*__/, '');

/**
 * Did this result FAIL, whatever the protocol says?
 *
 * `is_error` is not enough. `list_installed_datapacks` answers a signed-out
 * session with the prose "Error: Adobe sign-in required…" and `is_error: false`,
 * so the protocol reports a clean success. Four battery runs scored `ok` on
 * 2026-08-26 while the tool had answered nothing at all, and the "datapacks got
 * faster after the fix" reading came from exactly those runs — it had not got
 * faster, it had stopped working and the agent was giving up sooner.
 *
 * So: trust the flag, and also read the text.
 */
const ERROR_PROSE = /^\s*(error|failed|unable to|cannot|not signed in|sign-?in required)\b/i;

function failed(result) {
    if (!result) return false;
    return result.isError || ERROR_PROSE.test(result.preview);
}


/**
 * Was this run INVALID rather than informative?
 *
 * A tool the harness refused to let the agent call produces a route that looks
 * exactly like the agent choosing to go around us — and it is the opposite: the
 * agent chose us and was blocked. On 2026-08-26 `run_commerce_query` shipped and
 * was not added to `readonly-tools.txt`; the agent found it unprompted on first
 * exposure, called it, was denied, and the run scored `NOT-FINDABLE` — reading as
 * "the agent could not find the tool" when it had found it immediately.
 *
 * The allowlist guard cannot catch this: it checks the tools a prompt EXPECTS,
 * and no list predicts what an agent might reach for. So detect the SYMPTOM — a
 * permission denial anywhere in the run makes the run unscorable, not a finding.
 */
const DENIED = /permission[^.]*denied|requested permissions|don'?t ask mode|not allowed to use/i;

function blockedTools(calls, results) {
    const byId = new Map(results.map((r) => [r.id, r]));
    return calls
        .filter((c) => DENIED.test(byId.get(c.id)?.preview ?? ''))
        .map((c) => bare(c.name));
}

function score(calls, results, said, expect) {
    const names = calls.map((c) => bare(c.name));
    // A tool that was called and answered an error is NOT a hit. Scoring on the
    // call alone is how four signed-out runs came back green.
    const byIdEarly = new Map(results.map((r) => [r.id, r]));
    const hit = calls.some(
        (c) => expect.includes(bare(c.name)) && !failed(byIdEarly.get(c.id)),
    );
    const around = names.some((n) => n === 'Bash' || n === 'WebFetch');
    // The THIRD route around us, invisible until the component-config coverage
    // run: the agent answered perfectly by Glob+Read against the project dir —
    // native file tools, which are neither "our tool" nor "the shell". For a
    // tool whose whole job is reading project files, that is the honest
    // competition, and a scorer that cannot see it files the run under
    // NO-ROUTE, which claims nothing happened.
    const nativeFiles = names.some((n) => n === 'Read' || n === 'Glob' || n === 'Grep' || n === 'LS');
    const outcome = hit ? 'hit' : around ? 'around' : 'miss';

    // WHY, not just WHAT. "It did not use our tool" is one finding; the reason
    // splits into four with completely different fixes, and only one of them is
    // "build a new tool".
    const searched = names.some((n) => n === 'ToolSearch');
    const byId = new Map(results.map((r) => [r.id, r]));
    const ourCalls = calls.filter((c) => c.name.startsWith('mcp__demo-builder__'));
    const ourFailed = ourCalls.filter((c) => failed(byId.get(c.id)));
    const triedThenLeft = hit && around;

    // A blocked tool invalidates the run before anything else is judged.
    const blocked = blockedTools(calls, results);
    if (!blocked.length && expect.length === 0) {
        // A skill-only prompt (expectSkill, no expected tool). Without this
        // guard the chain below labels a run that successfully invoked its
        // skill NO-ROUTE — "neither our tool nor the shell" — which is a lie
        // of the same shape SIBLING-TOOL was added to stop. The verdict for
        // these prompts lives on skillDiagnosis.
        return { hit, around, outcome: 'skill-only', searched, triedThenLeft,
                 ourToolErrors: ourFailed.map((c) => bare(c.name)),
                 diagnosis: 'SKILL-ONLY: no tool expectation declared — the verdict is skillDiagnosis',
                 excuse: null };
    }
    if (blocked.length) {
        return {
            hit, around, outcome: 'invalid', searched, triedThenLeft, blocked,
            ourToolErrors: [], excuse: null,
            diagnosis: `INVALID: the harness blocked ${blocked.join(', ')} — add it to readonly-tools.txt and re-run`,
        };
    }

    let diagnosis;
    // ERRORED is checked before INSUFFICIENT: both look like "called ours, then
    // left", but a tool that threw is a bug to fix and a tool that answered
    // uselessly is a design to revisit. The more specific label wins.
    if (outcome === 'hit' && !around) diagnosis = ourFailed.length
        ? `TOOL-BROKEN: ${bare(ourFailed[0].name)} errored, but the answer came anyway`
        : 'ok';
    else if (!hit && ourFailed.length && !around)
        diagnosis = `TOOL-BROKEN: ${bare(ourFailed[0].name)} answered an error and nothing else worked`;
    else if (ourFailed.length) diagnosis = `TOOL-BROKEN: ${bare(ourFailed[0].name)} was called and errored`;
    else if (triedThenLeft) diagnosis = 'TOOL-INSUFFICIENT: called ours, still went to the shell';
    else if (around && searched) diagnosis = 'NOT-FINDABLE: it searched for a tool and still went around';
    else if (around && !searched) diagnosis = 'NOT-ANNOUNCED: it never looked — it did not know to';
    // A successful call to one of OUR tools that simply is not the expected one.
    // The old chain fell through to NO-ROUTE, whose label ("neither our tool nor
    // the shell") was a lie: the 2026-08-27 orientation runs answered perfectly
    // via get_project_status — the sibling door of the very fix under test — and
    // scored as if the agent had done nothing. A sibling is sometimes the finding
    // (wrong routing) and sometimes the design (two doors, one answer); the label
    // must say which tool so a human can tell.
    else if (ourCalls.some((c) => !failed(byId.get(c.id))))
        diagnosis = `SIBLING-TOOL: answered via ${bare(ourCalls.find((c) => !failed(byId.get(c.id))).name)} — is the expect list too narrow, or the routing wrong?`;
    else if (nativeFiles)
        diagnosis = 'NATIVE-FILES: answered by reading files directly (Read/Glob/Grep) — for a file-reading tool this is the real competition, and maybe the better answer';
    else diagnosis = 'NO-ROUTE: neither our tool nor the shell';

    // The agent's own account, when it gives one. Cheapest possible evidence.
    const excuse = said.find((s) => /\bno (mcp )?tool\b|not available|isn'?t a tool|no direct tool|fall back/i.test(s));

    return { hit, around, outcome, searched, triedThenLeft,
             ourToolErrors: ourFailed.map((c) => bare(c.name)), diagnosis,
             excuse: excuse ? excuse.slice(0, 300) : null };
}

/**
 * Skill coverage (AI-1q, skills half): a prompt with `expectSkill` is satisfied
 * when the transcript shows a `Skill` tool invocation of one of those names.
 *
 * Reaching the skill's FILE by Read/Grep/Glob is scored separately as
 * SKILL-AS-PROSE — real information reached the agent, but not through the
 * skill system. Before v27 that was the ONLY possible route (flat `<name>.md`
 * files are never registered as skills — measured 2026-08-27), so on a project
 * whose bundle predates v27 every skill prompt will score AS-PROSE at best;
 * that is a statement about the deployed bundle, not about the prompt.
 *
 * Returns null when the prompt declares no expectSkill — tool-only prompts
 * carry no skill verdict rather than a vacuous one.
 */
function scoreSkill(calls, expectSkill) {
    if (!expectSkill?.length) return null;
    const skillsInvoked = calls
        .filter((c) => c.name === 'Skill')
        .map((c) => c.input?.skill)
        .filter(Boolean);
    const skillHit = expectSkill.some((s) => skillsInvoked.includes(s));
    const readAsProse = calls.some(
        (c) =>
            ['Read', 'Grep', 'Glob'].includes(c.name) &&
            expectSkill.some((s) => JSON.stringify(c.input ?? {}).includes(`skills/${s}`)),
    );
    const skillDiagnosis = skillHit
        ? 'ok'
        : readAsProse
          ? 'SKILL-AS-PROSE: reached the skill file by reading it, never by invocation — pre-v27 layout, or the skill system did not route'
          : 'SKILL-UNUSED: the skill never entered the run in any form';
    return { expectSkill, skillsInvoked, skillHit, readAsProse, skillDiagnosis };
}

export { bare, failed, score, scoreSkill, blockedTools };
