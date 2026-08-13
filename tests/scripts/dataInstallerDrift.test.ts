/**
 * Drift checker tests — the controls that make a "no drift" result trustworthy.
 *
 * The failure this guards against is specific and has already happened: on
 * 2026-08-12 a probe against a guessed action name returned 404, the analysis
 * printed `False` for every question, and that read exactly like a clean result.
 * A checker that can report "no drift" when it never reached the service is worse
 * than no checker, because it manufactures confidence.
 *
 * So cases 4 and 5 below are the load-bearing ones: a non-200 must be a FAILURE,
 * never a clean pass. Everything else is offline and runs in CI.
 *
 * Strict TDD: written BEFORE the script exists.
 */

import { shapeDrift, checkEndpoint, modeFindings } from '../../scripts/dataInstallerDrift';

describe('shapeDrift', () => {
    it('reports nothing for identical shapes', () => {
        expect(shapeDrift({ a: 1, b: 'x' }, { a: 2, b: 'y' })).toEqual([]);
    });

    it('ignores VALUE differences — only shape matters', () => {
        expect(shapeDrift({ total: 35 }, { total: 9999 })).toEqual([]);
    });

    it('reports a renamed key, naming it', () => {
        const drift = shapeDrift({ datapacks: [] }, { datapack_list: [] });

        expect(drift).toHaveLength(1);
        expect(drift[0]).toMatchObject({ path: '$.datapacks', kind: 'missing' });
    });

    it('reports a removed field', () => {
        const drift = shapeDrift({ a: 1, b: 2 }, { a: 1 });

        expect(drift.map((d) => d.path)).toEqual(['$.b']);
    });

    it('reports a type change', () => {
        const drift = shapeDrift({ data: { x: 1 } }, { data: 'a json string' });

        expect(drift).toHaveLength(1);
        expect(drift[0]).toMatchObject({
            path: '$.data',
            kind: 'type',
            expected: 'object',
            actual: 'string',
        });
    });

    // The parsers ignore unknown fields by design, so an additive change is not a
    // break. Reporting it as drift would make the tool cry wolf, and a tool that
    // cries wolf gets ignored and then deleted.
    it('does NOT report an ADDED key', () => {
        expect(shapeDrift({ a: 1 }, { a: 1, b: 2 })).toEqual([]);
    });

    it('descends into nested objects', () => {
        const drift = shapeDrift({ page: { total: 1 } }, { page: {} });

        expect(drift.map((d) => d.path)).toEqual(['$.page.total']);
    });

    it('compares array elements by their merged shape', () => {
        const drift = shapeDrift({ rows: [{ id: 1 }] }, { rows: [{ ident: 1 }] });

        expect(drift.map((d) => d.path)).toEqual(['$.rows[*].id']);
    });

    it('does not trip on an empty array in the live response', () => {
        expect(shapeDrift({ rows: [{ id: 1 }] }, { rows: [] })).toEqual([]);
    });

    // Found by the first live run: the logs fixture's row 0 has nulls for
    // commerce_instance / scenario / site_type, today's row 0 has strings. That is
    // a nullable field with data in it, not a moved contract — and reporting it
    // was the cry-wolf failure that gets a checker deleted.
    describe('nullable fields', () => {
        it('does not report null -> value', () => {
            expect(shapeDrift({ scenario: null }, { scenario: 'DATAPACK_ALL_ITEMS' })).toEqual([]);
        });

        it('does not report value -> null', () => {
            expect(shapeDrift({ scenario: 'x' }, { scenario: null })).toEqual([]);
        });

        it('still reports a REAL type change either side of null', () => {
            const drift = shapeDrift({ data: { x: 1 } }, { data: 'json string' });
            expect(drift).toHaveLength(1);
        });
    });

    // Same root cause: trusting element 0 makes the result depend on row order,
    // so an unchanged API reports drift on a different day.
    describe('heterogeneous arrays', () => {
        it('is order-independent — merges keys across ALL elements', () => {
            const fixture = { rows: [{ a: 1 }, { a: 1, b: 2 }] };
            const live = { rows: [{ a: 9, b: 8 }, { a: 9 }] };

            expect(shapeDrift(fixture, live)).toEqual([]);
        });

        it('reports a key absent from EVERY live element', () => {
            const fixture = { rows: [{ a: 1, b: 2 }] };
            const live = { rows: [{ a: 1 }, { a: 1 }] };

            expect(shapeDrift(fixture, live).map((d) => d.path)).toEqual(['$.rows[*].b']);
        });
    });

    it('is deterministic — same input, identical output', () => {
        const a = shapeDrift({ a: 1, b: { c: 2 } }, { a: 'x', b: {} });
        const b = shapeDrift({ a: 1, b: { c: 2 } }, { a: 'x', b: {} });

        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe('checkEndpoint', () => {
    const fixture = { datapacks: [{ datapack_name: 'x' }] };

    function respond(status: number, body: unknown) {
        return jest.fn().mockResolvedValue({
            status,
            ok: status >= 200 && status < 300,
            text: async () => JSON.stringify(body),
        });
    }

    it('reports clean when the live shape matches the fixture', async () => {
        const result = await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/find-datapacks',
            fixture,
            token: 't',
            fetchImpl: respond(200, { datapacks: [{ datapack_name: 'y' }] }),
        });

        expect(result).toMatchObject({ ok: true, action: 'find-datapacks', drift: [] });
    });

    it('reports drift when a key disappears', async () => {
        const result = await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/find-datapacks',
            fixture,
            token: 't',
            fetchImpl: respond(200, { datapacks: [{ other: 1 }] }),
        });

        expect(result.ok).toBe(false);
        expect(result.drift.map((d) => d.path)).toEqual(['$.datapacks[*].datapack_name']);
    });

    // ---- the load-bearing pair -------------------------------------------------
    // A wrong action name is a bare 404 from the Runtime gateway. That must never
    // be reportable as "no drift".

    it('treats a 404 as a FAILURE, not a clean result', async () => {
        const result = await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/typo',
            fixture,
            token: 't',
            fetchImpl: respond(404, { error: 'not found' }),
        });

        expect(result.ok).toBe(false);
        expect(result.unreachable).toBe(true);
        expect(result.drift).toEqual([]);
        expect(result.error).toMatch(/404/);
    });

    it('treats a 401 as a FAILURE, not a clean result', async () => {
        const result = await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/find-datapacks',
            fixture,
            token: 'expired',
            fetchImpl: respond(401, { error: 'unauthorized' }),
        });

        expect(result.ok).toBe(false);
        expect(result.unreachable).toBe(true);
        expect(result.error).toMatch(/401/);
    });

    it('treats a thrown transport error as a FAILURE', async () => {
        const result = await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/find-datapacks',
            fixture,
            token: 't',
            fetchImpl: jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
        });

        expect(result.ok).toBe(false);
        expect(result.unreachable).toBe(true);
        expect(result.error).toMatch(/ENOTFOUND/);
    });

    it('treats an unparseable body as a FAILURE, not clean', async () => {
        const result = await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/find-datapacks',
            fixture,
            token: 't',
            fetchImpl: jest.fn().mockResolvedValue({
                status: 200,
                ok: true,
                text: async () => '<html>gateway</html>',
            }),
        });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/parse/i);
    });

    it('sends the bearer token', async () => {
        const fetchImpl = respond(200, fixture);
        await checkEndpoint({
            action: 'find-datapacks',
            url: 'https://example.invalid/find-datapacks',
            fixture,
            token: 'secret-value',
            fetchImpl,
        });

        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer secret-value');
    });
});

/**
 * Mode coverage — the check that would have caught the reset.
 *
 * The original plan enumerated ACTION names and decided each one, which was
 * thorough on the wrong unit: `operation_mode` is a parameter axis whose values
 * were USED (`validate`, `export`) without ever being ENUMERATED, and `delete` —
 * the reset — lived there, invisible to the review.
 *
 * The trap this has to survive: an unknown mode answers `200` with an EMPTY
 * processor list. It never 400s. So the signal is the COUNT, and a nonsense
 * control is the only thing that proves the count means anything.
 */
describe('modeFindings', () => {
    /**
     * The live shape as measured on 2026-08-13: four real modes, every guess
     * empty, the control empty.
     *
     * Complete on purpose — a mode missing from this map is treated as a FAILURE,
     * not as a zero. Silence is the thing this checker exists to refuse, so an
     * unasked question must not read as an answered one.
     */
    const HEALTHY = {
        import: 21,
        validate: 21,
        delete: 21,
        export: 18,
        update: 0,
        upsert: 0,
        sync: 0,
        compare: 0,
        rollback: 0,
        uninstall: 0,
        reset: 0,
        'zzz-not-a-real-mode': 0,
    };

    it('reports nothing when the surface matches what is decided', () => {
        expect(modeFindings(HEALTHY)).toEqual([]);
    });

    // If a made-up mode answers with processors, the endpoint is not validating
    // the parameter and NOTHING in the run distinguishes real from invented.
    it('invalidates the whole run when the control answers with processors', () => {
        const findings = modeFindings({ ...HEALTHY, 'zzz-not-a-real-mode': 21 });

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ mode: 'zzz-not-a-real-mode', invalidates: true });
    });

    it('does not report the other modes once the control has failed', () => {
        const findings = modeFindings({
            ...HEALTHY,
            import: 0,
            reset: 9,
            'zzz-not-a-real-mode': 21,
        });

        // One finding, not three: with an unreadable signal the rest is noise.
        expect(findings).toHaveLength(1);
    });

    // A mode the service GAINS is the whole point — that is the reset, arriving
    // before anyone notices it by hand.
    it('reports a candidate mode that has become real', () => {
        const findings = modeFindings({ ...HEALTHY, reset: 12 });

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ mode: 'reset', kind: 'undecided' });
    });

    it('reports a known mode that has gone empty', () => {
        const findings = modeFindings({ ...HEALTHY, export: 0 });

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ mode: 'export', kind: 'disappeared' });
    });

    // A failed request is never a clean answer — the rule the rest of this file exists for.
    it('treats an unreachable mode as a FAILURE, not as an empty one', () => {
        const findings = modeFindings({ ...HEALTHY, delete: null });

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ mode: 'delete', kind: 'unreachable' });
    });

    it('reports every genuine finding at once', () => {
        const findings = modeFindings({ ...HEALTHY, export: 0, reset: 12 });

        expect(findings.map((f) => f.mode).sort()).toEqual(['export', 'reset']);
    });
});
