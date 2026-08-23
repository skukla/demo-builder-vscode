/**
 * Shared drift-checking core — the shape comparison and endpoint-check rules
 * both drift checkers (`dataInstallerDrift.js`, `edsDrift.js`) are built on.
 *
 * Extracted 2026-08-23 when the EDS checker was added. Two consumers is below
 * the Rule of Three, but these rules are the exception that rule carries: the
 * two checkers MUST agree about what counts as drift, and each rule here was
 * paid for by a specific failure (see the docblocks). A divergent copy would
 * re-litigate those failures one checker at a time.
 *
 * The four load-bearing rules:
 * 1. A non-200, transport error or unparseable body is a FAILURE, never
 *    "no drift" — a checker that reports clean without reaching the service
 *    manufactures confidence.
 * 2. ADDED keys are not drift — parsers ignore unknown fields by design;
 *    reporting additive change makes the tool cry wolf, and a tool that cries
 *    wolf gets deleted.
 * 3. A null on either side carries no shape information (deliberate blind
 *    spot: a field going permanently null is invisible — the trade that keeps
 *    heterogeneous rows from producing false positives).
 * 4. Array elements are compared by their MERGED shape, never element 0 —
 *    optional fields make the verdict order-dependent otherwise.
 */

'use strict';

/** The JSON type of a value, flattening arrays and null out of `typeof`. */
function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
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
                out.push({
                    path: `${at}.${key}`,
                    kind: 'missing',
                    expected: typeOf(expected[key]),
                    actual: 'absent',
                });
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
 * Check one endpoint against its fixture.
 *
 * Never throws — every failure mode comes back as `{ok:false}` with a reason, so a
 * caller cannot mistake an error for a clean result.
 *
 * @param {object} opts
 * @param {string} opts.action - label for the report
 * @param {string} opts.url - full URL to GET
 * @param {unknown} opts.fixture - the committed fixture to compare against
 * @param {Record<string,string>} opts.headers - request headers (auth varies per service)
 * @param {typeof fetch} opts.fetchImpl - injectable for tests
 * @returns {Promise<{action:string, ok:boolean, unreachable?:boolean, error?:string, drift:object[]}>}
 */
async function checkEndpoint({ action, url, fixture, headers, fetchImpl }) {
    let response;
    try {
        response = await fetchImpl(url, { headers });
    } catch (error) {
        return {
            action,
            ok: false,
            unreachable: true,
            drift: [],
            error: String(error.message || error),
        };
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

module.exports = { typeOf, mergeElements, shapeDrift, checkEndpoint };
