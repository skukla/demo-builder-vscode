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
import { score, scoreSkill } from './score.mjs';

const M = 'mcp__demo-builder__';
const cases = [
 ['clean hit',        [{name:M+'list_blocks',id:'1',input:{}}], [], [], 'ok'],
 ['tool then shell',  [{name:M+'list_blocks',id:'1',input:{}},{name:'Bash',id:'2',input:{}}], [], [], 'TOOL-INSUFFICIENT'],
 ['our tool errored', [{name:M+'list_blocks',id:'1',input:{}},{name:'Bash',id:'2',input:{}}], [{id:'1',isError:true,preview:'boom'}], [], 'TOOL-BROKEN'],
 ['searched, around', [{name:'ToolSearch',id:'1',input:{}},{name:'Bash',id:'2',input:{}}], [], [], 'NOT-FINDABLE'],
 ['never looked',     [{name:'Bash',id:'1',input:{}}], [], ['There is no tool for this, so I will use curl.'], 'NOT-ANNOUNCED'],
 // This case scored NO-ROUTE until 2026-08-27, and the label was a lie: our
 // tool WAS called and answered. The live orientation runs hit this exact hole.
 ['sibling tool',     [{name:M+'get_project',id:'1',input:{}}], [], [], 'SIBLING-TOOL'],
 // The component-config coverage run: Glob+Read answered the question well and
 // scored NO-ROUTE, which claims nothing happened at all.
 ['native files',     [{name:'Glob',id:'1',input:{}},{name:'Read',id:'2',input:{}}], [], [], 'NATIVE-FILES'],
 ['nothing at all',   [], [], [], 'NO-ROUTE'],
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

// ── a blocked tool is an INVALID run, not a finding ─────────────────────────
//
// The fixture is the REAL denial, lifted from the run it fooled me with
// (results/2026-08-26T18-07*.jsonl). The agent had found `run_commerce_query` on
// first exposure and called it; the harness refused, and the run scored
// NOT-FINDABLE — the exact opposite of what happened.
const DENIAL = "Permission to use mcp__demo-builder__run_commerce_query has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tools that ";

const blockedCases = [
  ['a blocked tool invalidates the run',
   [{name: M + 'run_commerce_query', id: '1', input: {}}, {name: 'Bash', id: '2', input: {}}],
   [{id: '1', isError: false, preview: DENIAL}], [], 'INVALID'],
  ['an unblocked run is still scored normally',
   [{name: M + 'run_commerce_query', id: '1', input: {}}],
   [{id: '1', isError: false, preview: '{"data":{"productSearch":{"total_count":30}}}'}], [], 'ok'],
];
for (const [label, calls, results, said, want] of blockedCases) {
  const s = score(calls, results, said, ['run_commerce_query']);
  const ok = s.diagnosis.startsWith(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${s.outcome.padEnd(7)} ${s.diagnosis.slice(0, 62)}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);

// ── skill coverage (AI-1q skills half) ──────────────────────────────────────
//
// `scoreSkill` reads the Skill tool's invocations out of the same call list.
// The AS-PROSE case is the live probe that started this: asked to use
// diagnose-demo, the agent Glob+Grepped `.claude/skills/diagnose-demo.md` —
// real information, no skill invocation, because flat files never register.
const skillCases = [
  ['invoked',   [{name:'Skill',id:'1',input:{skill:'diagnose-demo'}}], 'ok'],
  ['as prose',  [{name:'Glob',id:'1',input:{pattern:'.claude/skills/**'}},
                 {name:'Grep',id:'2',input:{path:'/p/.claude/skills/diagnose-demo.md'}}], 'SKILL-AS-PROSE'],
  ['unused',    [{name:'Bash',id:'1',input:{command:'ls'}}], 'SKILL-UNUSED'],
];
for (const [label, calls, want] of skillCases) {
  const sk = scoreSkill(calls, ['diagnose-demo']);
  const ok = sk.skillDiagnosis.startsWith(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} skill: ${label.padEnd(10)} ${sk.skillDiagnosis.slice(0, 62)}`);
}
{
  // A skill-only prompt must not earn a lying tool label.
  const so = score([{name:'Skill',id:'1',input:{skill:'diagnose-demo'}}], [], [], []);
  const ok = so.outcome === 'skill-only' && so.diagnosis.startsWith('SKILL-ONLY');
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} skill: empty expect -> skill-only outcome, no NO-ROUTE lie`);
}
{
  const none = scoreSkill([{name:'Skill',id:'1',input:{skill:'x'}}], undefined);
  const ok = none === null;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} skill: no expectSkill -> null (no vacuous verdict)`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

