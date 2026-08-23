/**
 * Data Installer drift checker.
 *
 * Re-fetches the safe read endpoints and compares the SHAPE of each response
 * against the committed fixture in `tests/fixtures/data-installer/`. Reports what
 * moved. Writes nothing — it never touches the repo, so there is nothing to
 * sanitize and no fixture to accidentally overwrite.
 *
 * WHY THIS EXISTS. The 265 tests in this feature are fully offline: parser tests
 * `require` committed fixtures, client tests inject a stub `fetch`. So if the
 * service changes tomorrow, every test stays green and the client mis-parses live
 * data. The runtime drift canary in `dataInstallerClient.ts` checks eight
 * top-level keys and would have caught NONE of the seven documented divergences.
 * This closes that hole — it is the only thing we own that can say the contract
 * still holds.
 *
 * WHAT IT REFUSES TO DO. A non-200, a transport error or an unparseable body is a
 * FAILURE, never "no drift". On 2026-08-12 a probe against a guessed action name
 * returned 404 and the analysis printed a clean-looking result for every question;
 * a checker that can do that manufactures confidence and is worse than nothing.
 *
 * ADDED keys are not drift. The parsers ignore unknown fields by design, so an
 * additive change upstream is safe — reporting it would make this cry wolf, and a
 * tool that cries wolf gets ignored and then deleted.
 *
 * KNOWN BLIND SPOT, accepted deliberately: a null on either side is treated as
 * carrying no shape information, so a field that goes **permanently null** is
 * invisible here. That rule exists because log rows are heterogeneous and the
 * first live run reported drift on three fields whose contract had not moved —
 * the false positive that gets a checker switched off. The trade is coverage for
 * trust, and it is the right way round, but this is not full coverage: a field
 * quietly emptying upstream will not be caught by this script. The parsers
 * already tolerate it, so the failure mode is a UI that shows nothing rather than
 * one that breaks.
 *
 * Write endpoints are deliberately absent. This must stay safe to run at any time.
 *
 * Usage: npm run data-installer:drift
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { shapeDrift, checkEndpoint: coreCheckEndpoint } = require('./lib/driftCore');

const FIXTURES = path.join(__dirname, '..', 'tests', 'fixtures', 'data-installer');

/**
 * Safe GET endpoints with a committed fixture to compare against.
 *
 * `action` must be the LAST path segment — Runtime routes on it, so a wrong name
 * is a bare 404 rather than a readable error.
 */
const ENDPOINTS = [
    { action: 'health-check', fixture: 'health-check.json', query: '' },
    { action: 'find-datapacks', fixture: 'find-datapacks.json', query: '?limit=200' },
    { action: 'get-installed-datapacks', fixture: 'get-installed-datapacks.json', query: '?limit=200' },
    { action: 'logs', fixture: 'logs.json', query: '?limit=50' },
    { action: 'get-export-data-types', fixture: 'get-export-data-types.json', query: '' },
    { action: 'get-processor-order', fixture: 'processor-order-import.json', query: '?operation_mode=import' },
];

/**
 * The `operation_mode` values with a recorded decision, and the ones without.
 *
 * WHY THIS EXISTS, and it is a different hole from the one above. The shape checks
 * ask "does the response still look the same". This asks "does the service still
 * expose the same CAPABILITIES" — and the answer moved once already without anyone
 * noticing. The original plan enumerated ACTION names and made an explicit call on
 * each, which was thorough on the wrong unit: `operation_mode` is a parameter axis
 * whose values were USED (`validate` for the dry run, `export` for Stage 3) but
 * never ENUMERATED. `delete` — the reset, the thing that lets a project be reused —
 * sat on that axis and was invisible to a checklist built on action names.
 *
 * So coverage here is `action × mode`, and "no decision recorded" is a FAILURE
 * rather than silence. Every mode below is either decided in
 * `docs/systems/data-installer.md` or reported by this script.
 *
 * THE TRAP: an unknown mode answers `200` with an EMPTY processor list. It never
 * `400`s. The readable signal is therefore the COUNT, not the status — and a
 * deliberate nonsense mode is the only thing that proves a count means anything.
 * If the control ever comes back non-empty, the endpoint has stopped validating
 * the parameter and every other row becomes unreadable, so the run is invalidated
 * rather than reported.
 */
const DECIDED_MODES = ['import', 'validate', 'delete', 'export'];

/** Plausible values with NO decision recorded. Any of these turning real is news. */
const CANDIDATE_MODES = ['update', 'upsert', 'sync', 'compare', 'rollback', 'uninstall', 'reset'];

/** Must always come back empty. If it does not, nothing else here is readable. */
const CONTROL_MODE = 'zzz-not-a-real-mode';

/**
 * Turn `{mode: processorCount}` into the list of things a human must decide.
 *
 * `null` means the request never landed — a failure, never an empty answer.
 * Returns `[]` when the surface matches what is already decided.
 */
function modeFindings(counts) {
    const control = counts[CONTROL_MODE];
    if (control === null || control === undefined || control > 0) {
        // Deliberately the ONLY finding: with the signal unreadable, reporting the
        // other rows would dress noise up as evidence.
        return [
            {
                mode: CONTROL_MODE,
                kind: 'control-failed',
                invalidates: true,
                detail:
                    control === null || control === undefined
                        ? 'the control mode could not be reached, so no row below can be trusted'
                        : `a nonsense mode returned ${control} processors — the service is not validating operation_mode`,
            },
        ];
    }

    const findings = [];
    for (const mode of DECIDED_MODES) {
        const count = counts[mode];
        if (count === null || count === undefined) {
            findings.push({ mode, kind: 'unreachable', detail: 'the request did not land' });
        } else if (count === 0) {
            findings.push({
                mode,
                kind: 'disappeared',
                detail: 'a mode we build on returned no processors',
            });
        }
    }
    for (const mode of CANDIDATE_MODES) {
        const count = counts[mode];
        if (count === null || count === undefined) {
            findings.push({ mode, kind: 'unreachable', detail: 'the request did not land' });
        } else if (count > 0) {
            findings.push({
                mode,
                kind: 'undecided',
                detail: `the service now exposes ${count} processors for this mode and nothing records a decision about it`,
            });
        }
    }
    return findings;
}

/**
 * Check one endpoint against its fixture (thin adapter over the shared core in
 * `scripts/lib/driftCore.js`, keeping this script's token-based signature —
 * the Data Installer authenticates every read with one IMS Bearer token).
 */
async function checkEndpoint({ action, url, fixture, token, fetchImpl }) {
    return coreCheckEndpoint({
        action,
        url,
        fixture,
        headers: { Authorization: `Bearer ${token}` },
        fetchImpl,
    });
}

/** The IMS token the extension itself uses. */
function readToken() {
    const raw = execFileSync('aio', ['config', 'get', 'ims.contexts.cli.access_token', '--json'], {
        encoding: 'utf8',
    });
    const token = JSON.parse(raw).token;
    if (!token) throw new Error('no IMS token — run `aio login`');
    return token;
}

/**
 * The base URL to probe, from `DATA_INSTALLER_API_BASE_URL`.
 *
 * This read the SHIPPED DEFAULT of `demoBuilder.dataInstaller.apiBaseUrl` until
 * 2026-08-16. That default is now permanently empty — the bundled value was a
 * stage Runtime endpoint and this repository is public, so
 * `dataInstallerSettingsSchema.test.ts` pins it to `''`. Reading it produced an
 * empty base, every fetch got a relative URL, and all six endpoints died with
 * "Failed to parse URL": loudly, but for the wrong reason, and with no way to
 * ever pass.
 *
 * So the endpoint comes from the environment, which is where a value that must
 * not live in the repo belongs. Empty is refused rather than returned — an empty
 * base is exactly the failure this replaced.
 */
function readBaseUrl() {
    const configured = (process.env.DATA_INSTALLER_API_BASE_URL ?? '').trim();
    if (!configured) {
        throw new Error(
            'no endpoint to probe: set DATA_INSTALLER_API_BASE_URL to the Data Installer API base URL',
        );
    }
    return configured.replace(/\/$/, '');
}

async function main() {
    const baseUrl = readBaseUrl();
    const token = readToken();
    const results = [];

    for (const endpoint of ENDPOINTS) {
        results.push(
            await checkEndpoint({
                action: endpoint.action,
                url: `${baseUrl}/${endpoint.action}${endpoint.query}`,
                fixture: JSON.parse(fs.readFileSync(path.join(FIXTURES, endpoint.fixture), 'utf8')),
                token,
                fetchImpl: fetch,
            }),
        );
    }

    let failed = 0;
    for (const result of results) {
        if (result.ok) {
            console.log(`  ok        ${result.action}`);
            continue;
        }
        failed += 1;
        if (result.unreachable || result.error) {
            console.log(`  FAILED    ${result.action} — ${result.error}`);
            continue;
        }
        console.log(`  DRIFTED   ${result.action}`);
        for (const d of result.drift) {
            console.log(
                `              ${d.path}: ${d.kind === 'missing' ? 'missing' : `${d.expected} -> ${d.actual}`}`,
            );
        }
    }

    console.log(
        failed === 0
            ? `\n${results.length} endpoints match their fixtures.`
            : `\n${failed} of ${results.length} endpoints need attention. Re-capture the fixture, or fix the parser.`,
    );

    const findings = await checkModeCoverage({ baseUrl, token, fetchImpl: fetch });
    console.log(
        findings.length === 0
            ? `\noperation_mode: ${DECIDED_MODES.join(', ')} — no undecided capability.`
            : '\noperation_mode coverage needs attention:',
    );
    for (const f of findings) {
        console.log(`  ${f.kind.toUpperCase().padEnd(14)} ${f.mode} — ${f.detail}`);
    }
    if (findings.some((f) => f.invalidates)) {
        console.log(
            '  Read nothing else in this section: the mode signal itself is unreliable.',
        );
    } else if (findings.length > 0) {
        console.log(
            '  Decide each one in docs/systems/data-installer.md — wired, held back, or deferred — then move it to DECIDED_MODES.',
        );
    }

    process.exit(failed === 0 && findings.length === 0 ? 0 : 1);
}

/**
 * Ask the service which modes it knows, and hand the counts to {@link modeFindings}.
 *
 * `get-processor-order` is a GET that touches no instance and starts no work, so
 * this stays safe to run at any time — the rule the whole script is built on.
 */
async function checkModeCoverage({ baseUrl, token, fetchImpl }) {
    const counts = {};
    for (const mode of [...DECIDED_MODES, ...CANDIDATE_MODES, CONTROL_MODE]) {
        counts[mode] = await countProcessors({ baseUrl, token, fetchImpl, mode });
    }
    return modeFindings(counts);
}

/** How many processors this mode reports, or `null` if the request did not land. */
async function countProcessors({ baseUrl, token, fetchImpl, mode }) {
    try {
        const response = await fetchImpl(
            `${baseUrl}/get-processor-order?operation_mode=${encodeURIComponent(mode)}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.status !== 200) return null;
        const body = JSON.parse(await response.text());
        const list = body?.processors ?? body?.data?.processors ?? body?.data;
        return Array.isArray(list) ? list.length : null;
    } catch {
        return null;
    }
}

module.exports = {
    readBaseUrl,
    shapeDrift,
    checkEndpoint,
    modeFindings,
    ENDPOINTS,
    DECIDED_MODES,
    CANDIDATE_MODES,
    CONTROL_MODE,
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`drift check could not run: ${error.message}`);
        process.exit(2);
    });
}
