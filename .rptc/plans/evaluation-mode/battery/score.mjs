/**
 * Scoring, in its own module so the test IMPORTS it rather than copying it.
 *
 * The test used to carry a copy extracted from `run.mjs` at authoring time. On
 * 2026-08-26 the scorer was fixed to treat an error returned as PROSE as a
 * failure, and the test kept passing against the old copy — a test that agrees
 * with itself and not with the code.
 */

/** Strip the MCP prefix so a route reads as tool names. */
const bare = (n) => n.replace(/^mcp__demo-builder__/, '');

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


function score(calls, results, said, expect) {
    const names = calls.map((c) => bare(c.name));
    // A tool that was called and answered an error is NOT a hit. Scoring on the
    // call alone is how four signed-out runs came back green.
    const byIdEarly = new Map(results.map((r) => [r.id, r]));
    const hit = calls.some(
        (c) => expect.includes(bare(c.name)) && !failed(byIdEarly.get(c.id)),
    );
    const around = names.some((n) => n === 'Bash' || n === 'WebFetch');
    const outcome = hit ? 'hit' : around ? 'around' : 'miss';

    // WHY, not just WHAT. "It did not use our tool" is one finding; the reason
    // splits into four with completely different fixes, and only one of them is
    // "build a new tool".
    const searched = names.some((n) => n === 'ToolSearch');
    const byId = new Map(results.map((r) => [r.id, r]));
    const ourCalls = calls.filter((c) => c.name.startsWith('mcp__demo-builder__'));
    const ourFailed = ourCalls.filter((c) => failed(byId.get(c.id)));
    const triedThenLeft = hit && around;

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
    else diagnosis = 'NO-ROUTE: neither our tool nor the shell';

    // The agent's own account, when it gives one. Cheapest possible evidence.
    const excuse = said.find((s) => /\bno (mcp )?tool\b|not available|isn'?t a tool|no direct tool|fall back/i.test(s));

    return { hit, around, outcome, searched, triedThenLeft,
             ourToolErrors: ourFailed.map((c) => bare(c.name)), diagnosis,
             excuse: excuse ? excuse.slice(0, 300) : null };
}

export { bare, failed, score };
