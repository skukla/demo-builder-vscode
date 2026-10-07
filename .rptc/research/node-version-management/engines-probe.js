// Prototype of the proposed rule (2026-10-07), read-only: fetch each component's declared Node range,
// then pick one Node. Usage: node probe.js <path-to-semver>
const semver = require(process.argv[2]);
const { execSync } = require('child_process');
const gh = (repo, file) => { try { return Buffer.from(execSync(`gh api repos/${repo}/contents/${file} --jq .content`, {stdio:['ignore','pipe','ignore']}).toString(), 'base64').toString(); } catch { return undefined; } };
const repos = ['skukla/citisignal-nextjs','skukla/demo-erp','skukla/commerce-erp-integration','adobe/commerce-integration-starter-kit','skukla/app-builder-shell','skukla/eds-accs-mesh','skukla/headless-commerce-mesh','skukla/commerce-eds-mesh','PMET-public/commerce-demo-ingestion'];
const pkgs = ['@adobe/aio-cli','@adobe/aio-cli-plugin-api-mesh','@adobe-commerce/commerce-extensibility-tools','@playwright/mcp','@dropins/ai-tools'];
(async () => {
  const ranges = {};
  for (const r of repos) { const p = gh(r,'package.json'); try { ranges[r] = JSON.parse(p).engines?.node ?? '(none)'; } catch { ranges[r] = p === undefined ? '(unreadable)' : '(bad json)'; } }
  for (const p of pkgs) { const j = await (await fetch(`https://registry.npmjs.org/${p}/latest`)).json(); ranges[p] = j.engines?.node ?? '(none)'; }
  const index = await (await fetch('https://nodejs.org/dist/index.json')).json();
  const ltsMajors = [...new Set(index.filter(r => r.lts).map(r => semver.major(r.version)))];
  // The rule: the LOWEST long-term-support major that every declared range accepts,
  // at its newest patch. It only rises when a range's floor rises.
  const valid = Object.entries(ranges).filter(([, r]) => semver.validRange(r));
  const lowestFor = (rs) => [...ltsMajors].sort((a, b) => a - b)
    .map((m) => index.find((r) => r.lts && semver.major(r.version) === m)?.version)
    .find((v) => v && rs.every((r) => semver.satisfies(v, r)));
  const all = lowestFor(valid.map(([, r]) => r));
  console.log('one Node for everything:', all ?? 'NONE - the ranges do not overlap');
  for (const [k, range] of Object.entries(ranges)) {
    const own = semver.validRange(range) ? lowestFor([range]) : '(declares none)';
    console.log(`${k.padEnd(46)} ${String(range).padEnd(22)} alone -> ${own}`);
  }
  // Which ranges stand in the way: drop each range whose OWN ceiling is below the
  // overlap of the others, and show what everything else agrees on.
  const capped = valid.filter(([, r]) => !semver.satisfies('99.0.0', r));
  const open = valid.filter(([, r]) => semver.satisfies('99.0.0', r));
  console.log('ranges with a ceiling:', capped.map(([k, r]) => `${k} (${r})`).join(', ') || 'none');
  console.log('one Node for the open-ended ranges:', lowestFor(open.map(([, r]) => r)) ?? 'NONE');
  console.log('one Node for everything except capped ranges that exclude it:',
    lowestFor(valid.filter(([, r]) => semver.satisfies(lowestFor(open.map(([, x]) => x)) ?? '0.0.0', r)).map(([, r]) => r)) ?? 'NONE');
})();
