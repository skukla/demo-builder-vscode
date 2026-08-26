/**
 * Scoring tests — they IMPORT the scorer, they do not copy it.
 *
 * An earlier version pasted `score` in at authoring time. When the scorer was
 * fixed to treat an error returned as prose as a failure, this file kept
 * testing the old copy and passing. A test that agrees with itself and not
 * with the code is worse than no test.
 *
 *   node .rptc/plans/evaluation-mode/battery/score.test.mjs
 */
import { score } from './score.mjs';

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

// ── error-as-prose ──────────────────────────────────────────────────────────
//
// The fixture below is a REAL tool_result, lifted verbatim from
// results/2026-08-26T17-21*.jsonl. `is_error` is FALSE and the text is an error.
// Four battery runs scored `ok` on it, and the "datapacks got faster" reading
// came from those runs — it had not got faster, it had stopped working.
const SIGNED_OUT = {"id": "1", "isError": false, "preview": "Error: Adobe sign-in required. Check get_auth_status, then sign_in(provider:\"adobe\") once the user agrees. [AU"};

const proseCases = [
  ['error prose is not a hit',
   [{name: M + 'list_installed_datapacks', id: '1', input: {}}],
   [SIGNED_OUT], [], 'TOOL-BROKEN'],
  ['a real success beside it still counts',
   [{name: M + 'list_installed_datapacks', id: '2', input: {}}],
   [{id: '2', isError: false, preview: '{"items":[{"id":{"name":"bodea"}}]}'}], [], 'ok'],
];
for (const [label, calls, results, said, want] of proseCases) {
  const s = score(calls, results, said, ['list_installed_datapacks']);
  const ok = s.diagnosis.startsWith(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${s.outcome.padEnd(7)} ${s.diagnosis}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

