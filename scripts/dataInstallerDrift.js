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

/** The JSON type of a value, flattening arrays and null out of `typeof`. */
function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * Shape differences between a committed fixture and a live response.
 *
 * Reports MISSING keys and CHANGED types. Ignores values entirely, and ignores
 * keys the live response added.
 *
 * @param {unknown} expected - the fixture
 * @param {unknown} actual - the live body
 * @param {string} at - JSON path of the current node
 * @returns {{path: string, kind: 'missing'|'type', expected: string, actual: string}[]}
 */
function shapeDrift(expected, actual, at = '$') {
    const expectedType = typeOf(expected);
    const actualType = typeOf(actual);

    // A null on either side carries no shape information — the field is nullable
    // and this row happens not to have a value. Reporting it made the FIRST live
    // run cry drift on three log fields whose contract had not moved.
    if (expectedType === 'null' || actualType === 'null') {
        return [];
    }

    if (expectedType !== actualType) {
        return [{ path: at, kind: 'type', expected: expectedType, actual: actualType }];
    }

    if (expectedType === 'object') {
        const out = [];
        // Sorted so the report is byte-identical run to run — a checker whose
        // output reorders reads as a change and destroys its own signal.
        for (const key of Object.keys(expected).sort()) {
            if (!Object.prototype.hasOwnProperty.call(actual, key)) {
                out.push({ path: `${at}.${key}`, kind: 'missing', expected: typeOf(expected[key]), actual: 'absent' });
                continue;
            }
            out.push(...shapeDrift(expected[key], actual[key], `${at}.${key}`));
        }
        return out;
    }

    if (expectedType === 'array') {
        // An empty live array is not drift: it means no rows today, not a moved
        // shape. Only compare when both sides have something to compare.
        if (expected.length === 0 || actual.length === 0) return [];
        // MERGED, not element 0. Rows are heterogeneous — optional fields are
        // absent or null on some — so trusting the first row makes the verdict
        // depend on row ORDER, and an unchanged API reports drift on a different
        // day. That is what the first live run did.
        return shapeDrift(mergeElements(expected), mergeElements(actual), `${at}[*]`);
    }

    return [];
}

/**
 * One representative element carrying every key any element has.
 *
 * The first non-null value wins for each key, so a key present-but-null in row 0
 * and populated in row 7 is typed from row 7.
 */
function mergeElements(items) {
    const objects = items.filter((item) => typeOf(item) === 'object');
    if (objects.length === 0) return items[0];

    const merged = {};
    for (const item of objects) {
        for (const key of Object.keys(item)) {
            if (!Object.prototype.hasOwnProperty.call(merged, key) || merged[key] === null) {
                merged[key] = item[key];
            }
        }
    }
    return merged;
}

/**
 * Check one endpoint against its fixture.
 *
 * Never throws — every failure mode comes back as `{ok:false}` with a reason, so a
 * caller cannot mistake an error for a clean result.
 *
 * @returns {Promise<{action:string, ok:boolean, unreachable?:boolean, error?:string, drift:object[]}>}
 */
async function checkEndpoint({ action, url, fixture, token, fetchImpl }) {
    let response;
    try {
        response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
        return { action, ok: false, unreachable: true, drift: [], error: String(error.message || error) };
    }

    if (response.status !== 200) {
        return {
            action,
            ok: false,
            unreachable: true,
            drift: [],
            error: `HTTP ${response.status} — the service did not answer this action`,
        };
    }

    let body;
    try {
        body = JSON.parse(await response.text());
    } catch {
        return { action, ok: false, drift: [], error: 'could not parse the response as JSON' };
    }

    const drift = shapeDrift(fixture, body);
    return { action, ok: drift.length === 0, drift };
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

/** The configured base URL, read from the shipped setting's default. */
function readBaseUrl() {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    for (const section of pkg.contributes.configuration) {
        const setting = section.properties?.['demoBuilder.dataInstaller.apiBaseUrl'];
        if (setting) return setting.default.replace(/\/$/, '');
    }
    throw new Error('demoBuilder.dataInstaller.apiBaseUrl is not declared in package.json');
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
    process.exit(failed === 0 ? 0 : 1);
}

module.exports = { shapeDrift, checkEndpoint, ENDPOINTS };

if (require.main === module) {
    main().catch((error) => {
        console.error(`drift check could not run: ${error.message}`);
        process.exit(2);
    });
}
