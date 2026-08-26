const bare = (n) => n.replace(/^mcp__demo-builder__/, '');

function score(calls, results, said, expect) {
    const names = calls.map((c) => bare(c.name));
    const hit = names.some((n) => expect.includes(n));
    const around = names.some((n) => n === 'Bash' || n === 'WebFetch');
    const outcome = hit ? 'hit' : around ? 'around' : 'miss';

    // WHY, not just WHAT. "It did not use our tool" is one finding; the reason
    // splits into four with completely different fixes, and only one of them is
    // "build a new tool".
    const searched = names.some((n) => n === 'ToolSearch');
    const byId = new Map(results.map((r) => [r.id, r]));
    const ourCalls = calls.filter((c) => c.name.startsWith('mcp__demo-builder__'));
    const ourFailed = ourCalls.filter((c) => byId.get(c.id)?.isError);
    const triedThenLeft = hit && around;

    let diagnosis;
    // ERRORED is checked before INSUFFICIENT: both look like "called ours, then
    // left", but a tool that threw is a bug to fix and a tool that answered
    // uselessly is a design to revisit. The more specific label wins.
    if (outcome === 'hit' && !around) diagnosis = ourFailed.length
        ? `TOOL-BROKEN: ${bare(ourFailed[0].name)} errored, but the answer came anyway`
        : 'ok';
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

const M = 'mcp__demo-builder__';
const cases = [
 ['clean hit',        [{name:M+'list_blocks',id:'1',input:{}}], [], [], 'ok'],
 ['tool then shell',  [{name:M+'list_blocks',id:'1',input:{}},{name:'Bash',id:'2',input:{}}], [], [], 'TOOL-INSUFFICIENT'],
 ['our tool errored', [{name:M+'list_blocks',id:'1',input:{}},{name:'Bash',id:'2',input:{}}], [{id:'1',isError:true,preview:'boom'}], [], 'TOOL-BROKEN'],
 ['searched, around', [{name:'ToolSearch',id:'1',input:{}},{name:'Bash',id:'2',input:{}}], [], [], 'NOT-FINDABLE'],
 ['never looked',     [{name:'Bash',id:'1',input:{}}], [], ['There is no tool for this, so I will use curl.'], 'NOT-ANNOUNCED'],
 ['nothing at all',   [{name:M+'get_project',id:'1',input:{}}], [], [], 'NO-ROUTE'],
];
let pass = 0, fail = 0;
for (const [label, calls, results, said, want] of cases) {
  const s = score(calls, results, said, ['list_blocks']);
  const ok = s.diagnosis.startsWith(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(18)} ${s.outcome.padEnd(7)} ${s.diagnosis}`
    + (s.excuse ? `\n         said: ${s.excuse.slice(0,50)}` : ''));
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
