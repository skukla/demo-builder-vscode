/**
 * EDS contract drift checker.
 *
 * Re-fetches the safe READ endpoints of the external services EDS builds on —
 * Helix Admin, the AEM Config Service, DA.live — and compares each response's
 * SHAPE against the committed fixture in `tests/fixtures/eds/drift/`. Also
 * probes ONE behavioural contract with no JSON shape: the aem.live CDN's
 * rejection of percent-encoded paths (ADR-007's foundation).
 *
 * WHY THIS EXISTS. EDS has 36 service files making external HTTP calls and
 * every test is offline — any of those contracts can move and the suite stays
 * green. The four contracts pinned here are precisely the ones that have
 * ALREADY moved or bitten in production: the Helix status two-level semantics
 * (outer = site, inner code.status = App), the Config Service site/roster
 * shapes, the DA.live site-config scope, and the aem.live path-encoding limit.
 *
 * THE RULES (shared core, `scripts/lib/driftCore.js` — each paid for):
 * a non-200/transport error/unparseable body is a FAILURE never "no drift";
 * ADDED keys are not drift; nulls carry no shape information; arrays compare
 * by merged shape. The behavioural probe carries its own control: the site
 * root must answer 200, or the encoding verdict is unreadable and the run is
 * invalidated rather than reported.
 *
 * NOT A CI GATE — structurally. Every credential here is interactive: the
 * GitHub token is the user's OAuth token, the DA.live token comes from the
 * bookmarklet flow. It is a manual pre-release check, run by a person who is
 * already looking (`cut-release`'s advisory block). Wiring it into CI will
 * fail on missing credentials and get it disabled — do not.
 *
 * READS ONLY. EDS writes (publish, unpublish, repo create, content copy)
 * mutate customer-visible state and are deliberately absent.
 *
 * Usage:
 *   EDS_DRIFT_OWNER=<github-owner> EDS_DRIFT_REPO=<repo> \
 *   EDS_DRIFT_DA_ORG=<da-org> EDS_DRIFT_DA_SITE=<da-site> \
 *   EDS_DRIFT_GITHUB_TOKEN=<gho_…> EDS_DRIFT_DA_TOKEN=<ims-bearer> \
 *   npm run eds:drift [-- --capture]
 *
 * `--capture` writes the current live shapes as the fixtures (first-time
 * bootstrap, or a reviewed re-baseline after a deliberate upstream change).
 * Point it at a REAL storefront the operator owns; identifiers never leave
 * the machine — fixtures are shapes of responses about your own site, review
 * them before committing (the repo is public).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { checkEndpoint, shapeDrift } = require('./lib/driftCore');

const FIXTURES = path.join(__dirname, '..', 'tests', 'fixtures', 'eds', 'drift');

// The same constants the extension itself uses (helixApiClient.ts,
// daLiveConstants.ts). Duplicated as literals because this script must run
// without a TypeScript build; `edsDrift.test.ts` pins them against the source
// so they cannot drift silently.
const HELIX_ADMIN_URL = 'https://admin.hlx.page';
const DA_LIVE_BASE_URL = 'https://admin.da.live';

/**
 * The read contracts with a committed fixture.
 *
 * Each returns the URL + headers for the configured identifiers. `auth` names
 * which token the check needs so a missing credential fails THAT check loudly
 * instead of failing all of them confusingly.
 */
function endpoints(cfg) {
    return [
        {
            // The two-level status contract: outer = the SITE, inner
            // `code.status` = the real Code Sync App detector. Conflating the
            // levels is where every bug in that area came from — this pins
            // both levels' presence.
            action: 'helix-status',
            fixture: 'helix-status.json',
            url: `${HELIX_ADMIN_URL}/status/${cfg.owner}/${cfg.repo}/main?editUrl=auto`,
            headers: { 'x-auth-token': cfg.githubToken },
            needs: 'EDS_DRIFT_GITHUB_TOKEN',
        },
        {
            // The Config Service SITE entry — the lookup key is the GitHub
            // owner/repo-derived site id (NOT the DA.live name; getting that
            // backwards caused a silent bulk-publish failure).
            action: 'config-service-site',
            fixture: 'config-service-site.json',
            url: `${HELIX_ADMIN_URL}/config/${cfg.daOrg}/sites/${cfg.repo}.json`,
            headers: { Authorization: `Bearer ${cfg.daToken}` },
            needs: 'EDS_DRIFT_DA_TOKEN',
        },
        {
            // The org ROSTER — `config/{org}.json` carries `users: [{email,
            // roles}]`; the admin-role model (site grants, org admins) reads
            // and writes through this shape.
            action: 'config-service-roster',
            fixture: 'config-service-roster.json',
            url: `${HELIX_ADMIN_URL}/config/${cfg.daOrg}.json`,
            headers: { Authorization: `Bearer ${cfg.daToken}` },
            needs: 'EDS_DRIFT_DA_TOKEN',
        },
        {
            // The DA.live per-SITE config — where `aem.repositoryId` must be
            // written for the Assets panel (site scope, not org scope; the
            // scope mixup shipped once).
            action: 'dalive-site-config',
            fixture: 'dalive-site-config.json',
            url: `${DA_LIVE_BASE_URL}/config/${cfg.daOrg}/${cfg.daSite}/`,
            headers: { Authorization: `Bearer ${cfg.daToken}` },
            needs: 'EDS_DRIFT_DA_TOKEN',
        },
    ];
}

/**
 * The aem.live path-encoding contract (behavioural — no JSON shape).
 *
 * The CDN rejects percent-encoded paths with a bare 404 BEFORE the storefront
 * renders, which is why PDP URLs use the `_HH` underscore-escape instead of
 * `encodeURIComponent` (ADR-007). If the CDN ever starts ACCEPTING encoded
 * paths, that constraint is gone and the encoding scheme deserves a rethink —
 * this check is what notices.
 *
 * Control first: the site ROOT must answer 200. Without it, a 404 on the
 * encoded path is indistinguishable from the whole site being down, so the
 * run is invalidated rather than reported.
 *
 * @returns {Promise<{action:string, ok:boolean, invalidated?:boolean, error?:string}>}
 */
async function checkPathEncoding({ owner, repo, fetchImpl }) {
    const base = `https://main--${repo}--${owner}.aem.live`;
    const action = 'aemlive-path-encoding';

    let control;
    try {
        control = await fetchImpl(`${base}/`, { method: 'HEAD' });
    } catch (error) {
        return {
            action,
            ok: false,
            invalidated: true,
            error: `control unreachable: ${String(error.message || error)}`,
        };
    }
    if (control.status !== 200) {
        return {
            action,
            ok: false,
            invalidated: true,
            error: `control failed: site root answered HTTP ${control.status}, so the encoding verdict is unreadable`,
        };
    }

    let probe;
    try {
        probe = await fetchImpl(`${base}/drift%2Fprobe`, { method: 'HEAD' });
    } catch (error) {
        return { action, ok: false, error: String(error.message || error) };
    }
    if (probe.status === 404) {
        return { action, ok: true };
    }
    return {
        action,
        ok: false,
        error:
            `a percent-encoded path answered HTTP ${probe.status} (expected 404) — the CDN's ` +
            'encoding contract has MOVED and ADR-007\'s premise needs re-verification',
    };
}

/** Read the identifiers + credentials, refusing to run half-configured. */
function readConfig(env) {
    const required = [
        'EDS_DRIFT_OWNER',
        'EDS_DRIFT_REPO',
        'EDS_DRIFT_DA_ORG',
        'EDS_DRIFT_DA_SITE',
        'EDS_DRIFT_GITHUB_TOKEN',
        'EDS_DRIFT_DA_TOKEN',
    ];
    const missing = required.filter((key) => !(env[key] ?? '').trim());
    if (missing.length > 0) {
        throw new Error(`missing configuration: set ${missing.join(', ')}`);
    }
    return {
        owner: env.EDS_DRIFT_OWNER.trim(),
        repo: env.EDS_DRIFT_REPO.trim(),
        daOrg: env.EDS_DRIFT_DA_ORG.trim(),
        daSite: env.EDS_DRIFT_DA_SITE.trim(),
        githubToken: env.EDS_DRIFT_GITHUB_TOKEN.trim(),
        daToken: env.EDS_DRIFT_DA_TOKEN.trim(),
    };
}

/** Fetch one endpoint's live body for `--capture`. Throws on any failure. */
async function captureFixture({ url, headers, fetchImpl }) {
    const response = await fetchImpl(url, { headers });
    if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(await response.text());
}

async function main() {
    const cfg = readConfig(process.env);
    const capture = process.argv.includes('--capture');
    const checks = endpoints(cfg);

    if (capture) {
        fs.mkdirSync(FIXTURES, { recursive: true });
        for (const check of checks) {
            try {
                const body = await captureFixture({ ...check, fetchImpl: fetch });
                fs.writeFileSync(
                    path.join(FIXTURES, check.fixture),
                    `${JSON.stringify(body, null, 2)}\n`,
                );
                console.log(`  captured  ${check.action} -> tests/fixtures/eds/drift/${check.fixture}`);
            } catch (error) {
                console.log(`  FAILED    ${check.action} — ${error.message} (fixture not written)`);
            }
        }
        console.log(
            '\nReview the fixtures before committing — they describe YOUR storefront, and this repo is public.',
        );
        return;
    }

    let failed = 0;
    for (const check of checks) {
        const fixturePath = path.join(FIXTURES, check.fixture);
        if (!fs.existsSync(fixturePath)) {
            failed += 1;
            console.log(
                `  FAILED    ${check.action} — no fixture committed; bootstrap with --capture first`,
            );
            continue;
        }
        const result = await checkEndpoint({
            action: check.action,
            url: check.url,
            fixture: JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
            headers: check.headers,
            fetchImpl: fetch,
        });
        if (result.ok) {
            console.log(`  ok        ${result.action}`);
            continue;
        }
        failed += 1;
        if (result.unreachable || result.error) {
            console.log(`  FAILED    ${result.action} — ${result.error} (needs ${check.needs})`);
            continue;
        }
        console.log(`  DRIFTED   ${result.action}`);
        for (const d of result.drift) {
            console.log(
                `              ${d.path}: ${d.kind === 'missing' ? 'missing' : `${d.expected} -> ${d.actual}`}`,
            );
        }
    }

    const encoding = await checkPathEncoding({ ...cfg, fetchImpl: fetch });
    if (encoding.ok) {
        console.log(`  ok        ${encoding.action} (CDN still rejects percent-encoded paths)`);
    } else {
        failed += 1;
        console.log(
            `  ${encoding.invalidated ? 'INVALID  ' : 'DRIFTED  '} ${encoding.action} — ${encoding.error}`,
        );
    }

    console.log(
        failed === 0
            ? '\nEDS contracts match their pins.'
            : `\n${failed} check(s) need attention. Re-capture the fixture after verifying the change, or fix the consumer.`,
    );
    process.exit(failed === 0 ? 0 : 1);
}

module.exports = {
    endpoints,
    checkPathEncoding,
    readConfig,
    HELIX_ADMIN_URL,
    DA_LIVE_BASE_URL,
    // Re-exported so a future consumer reaches the shared core through either
    // checker without caring which one it found first.
    shapeDrift,
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`eds drift check could not run: ${error.message}`);
        process.exit(2);
    });
}
