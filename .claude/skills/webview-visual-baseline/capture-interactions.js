/**
 * Interaction-state fingerprints — hover, focus and active (PL-21 phase 4 step 0).
 *
 * The last machine-buildable condition on ADR-018's evidence bar for migrating
 * existing CSS: "capture interaction states (hover, focus, disabled, error) — and
 * those are exactly where Spectrum's own rules concentrate."
 *
 * 147 rules across our stylesheets carry an interaction selector (68 `:hover`,
 * 45 `:focus`, 19 `:focus-visible`, 8 `:disabled`, 5 `:active`), and the resting
 * fingerprint in `capture.js` cannot see ONE of them. The layer fix changes which
 * of our rules beat Spectrum's, so a net blind to hover is blind exactly where the
 * risk is highest.
 *
 * WHY THIS IS A SEPARATE FILE FROM capture.js. `capture.js` is evaluated INSIDE the
 * page. Forcing a pseudo-class cannot be done from page JS — `:hover` is driven by
 * the browser's own input state and there is no DOM API for it. It needs CDP
 * (`CSS.forcePseudoState`), which is driven from PLAYWRIGHT, outside the page. So
 * this runs as the body of a `browser_run_code` call and takes `page`, where
 * `capture.js` takes nothing and runs in `browser_evaluate`.
 *
 * REJECTED ALTERNATIVE, recorded so it is not re-attempted: rewriting every
 * `:hover` selector into a marker class and toggling that class. Specificity would
 * survive (`:hover` and `.cls` are both 0-1-0) but it requires enumerating rules
 * through the CSSOM, and on 2026-09-08 the CSSOM under-reported this bundle's
 * largest sheet by two orders of magnitude — 21 rules exposed for 225,251
 * characters of CSS that demonstrably applies. Whatever the cause, an instrument
 * built on that enumeration would silently measure a fraction of the rules.
 * Forcing the state and reading `getComputedStyle` avoids the question entirely.
 *
 *     const before = await captureInteractions(page);
 *     // ... change CSS, rebuild, re-copy bundles ...
 *     const after  = await captureInteractions(page);
 *     diffInteractions(before, after)
 *
 * Keys are `surface|selectorIndex|state`, and the element's accessible label rides
 * along so a diff names something a human recognises rather than an index.
 */

/** Matches capture.js. Keep the two lists in step or the diffs are not comparable. */
const PROPS = [
    'color', 'background-color', 'font-size', 'font-weight', 'padding', 'margin',
    'display', 'position', 'width', 'height', 'border', 'flex-direction',
    'align-items', 'justify-content', 'opacity', 'text-align',
    'box-shadow', 'border-radius', 'z-index', 'transform', 'overflow', 'outline', 'gap',
    'letter-spacing', 'text-transform', 'line-height',
];

const SURFACES = [
    'wizard', 'dashboard', 'configure', 'sidebar',
    'projectsList', 'aiOverview', 'integrations', 'dataInstaller',
];

/**
 * What counts as interactive. Deliberately wider than `button, a` — Spectrum
 * renders pressables as `div[role=button]` and its fields put the focus ring on an
 * inner input rather than the labelled wrapper.
 */
const INTERACTIVE =
    'button, a, input, select, textarea, summary, ' +
    '[role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], ' +
    '[role="switch"], [role="option"], [tabindex]:not([tabindex="-1"])';

const STATES = ['hover', 'focus', 'active'];

/** A real surface never has zero interactive elements; zero means it did not mount. */
const MIN_INTERACTIVE = 1;

/**
 * Kill transitions before forcing anything.
 *
 * `CSS.forcePseudoState` changes which rules match INSTANTLY; a transitioned
 * property then takes its duration to arrive, and `getComputedStyle` reads
 * whatever value the animation happens to be at. So the fingerprint of a
 * transitioned element is a function of how long the previous await took — the
 * same build compared against itself moves.
 *
 * Measured 2026-09-09, on the .dashboard-* migration cycle: two runs of the SAME
 * bundle disagreed about `sidebar|0` (background rgb(0,0,0) vs rgb(1,1,1)), and a
 * clean move was reported as changing `dashboard|7` at focus and active — the
 * captured values were ~10% and ~0% through a 200ms lift. Re-measured with the
 * transition disabled, all 36 dashboard cells were byte-identical across the move.
 * A false positive is the one failure mode that makes an instrument worse than
 * none, because the response to it is to revert correct work.
 *
 * Unlayered `!important` so it beats our layered rules (ADR-018's own trap), and
 * `transition` is not one of the properties captured, so removing it cannot hide
 * a real change.
 */
const FREEZE_TRANSITIONS = `
    *, *::before, *::after {
        transition: none !important;
        animation: none !important;
    }
`;

async function captureInteractions(page, { surfaces = SURFACES, base, theme = 'dark', width = 1280 } = {}) {
    const out = {};
    for (const surface of surfaces) {
        await page.goto(`${base}/h.html?b=${surface}&t=${theme}&cb=${Date.now()}${Math.random()}`);
        await page.waitForTimeout(3500);

        // AFTER the surface has mounted and settled, not before: freezing during
        // mount would also freeze whatever entrance animation the fixture needs to
        // finish, and the rest fingerprint would be of a half-arrived surface.
        await page.addStyleTag({ content: FREEZE_TRANSITIONS });
        // The CSS freeze does not reach a Web Animations API animation, which no
        // stylesheet declares and no `!important` can outrank. `capture.js` pins
        // those through the harness's `__FREEZE__`; this did not, and one sidebar
        // tile kept drifting by a colour channel or two between runs of the SAME
        // build after the transition freeze had removed every other disagreement.
        await page.evaluate(() => { if (window.__FREEZE__) window.__FREEZE__(); });

        const cdp = await page.context().newCDPSession(page);
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
        const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
            nodeId: root.nodeId,
            selector: INTERACTIVE,
        });

        if (nodeIds.length < MIN_INTERACTIVE) {
            await cdp.detach();
            throw new Error(
                `${surface}: ${nodeIds.length} interactive elements — the surface did not mount. ` +
                `Re-run; do not diff this.`
            );
        }

        const read = (i) =>
            page.evaluate(
                ([idx, props, sel]) => {
                    // Re-pin before every read: forcing a state can START an
                    // animation, so freezing once at mount is not enough.
                    if (window.__FREEZE__) window.__FREEZE__();
                    const el = document.querySelectorAll(sel)[idx];
                    if (!el) return null;
                    const cs = getComputedStyle(el);
                    return {
                        label:
                            (el.getAttribute('aria-label') || el.textContent || '')
                                .trim()
                                .slice(0, 32) || `<${el.tagName.toLowerCase()}>`,
                        v: props.map((p) => cs.getPropertyValue(p)).join('|'),
                    };
                },
                [i, PROPS, INTERACTIVE]
            );

        for (let i = 0; i < nodeIds.length; i++) {
            const rest = await read(i);
            if (!rest) continue;
            out[`${surface}|${i}|rest`] = `${rest.label}\t${rest.v}`;
            for (const state of STATES) {
                await cdp.send('CSS.forcePseudoState', {
                    nodeId: nodeIds[i],
                    forcedPseudoClasses: [state],
                });
                const got = await read(i);
                await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[i], forcedPseudoClasses: [] });
                if (got) out[`${surface}|${i}|${state}`] = `${got.label}\t${got.v}`;
            }
        }
        await cdp.detach();
    }
    return out;
}

/** Diff two interaction captures; returns the cells that moved, named by property. */
function diffInteractions(before, after) {
    const moved = [];

    // A SURFACE WITH A DIFFERENT ELEMENT COUNT INVALIDATES THE WHOLE COMPARISON,
    // and saying so is the only useful answer. Keys are `surface|index|state`, so
    // one element more or fewer shifts every index after it and every later cell
    // reads as changed. On 2026-09-09 the integrations surface rendered 9
    // interactive elements in a session's FIRST capture and 3 in every one after —
    // 36 phantom differences, none of them real, and the report named none of them
    // as a count problem. `capture.js`'s own diff has always refused this way; this
    // one silently mis-aligned instead.
    const perSurface = (o) => {
        const c = new Map();
        for (const k of Object.keys(o)) {
            const s = k.split('|')[0];
            c.set(s, (c.get(s) ?? 0) + 1);
        }
        return c;
    };
    const a = perSurface(before);
    const b = perSurface(after);
    const mismatched = [...a.keys()].filter((s) => a.get(s) !== (b.get(s) ?? 0));
    if (mismatched.length) {
        return mismatched.map((s) => ({
            key: s,
            note: `element count ${a.get(s) / 4} -> ${(b.get(s) ?? 0) / 4} — the surface rendered differently, so NOTHING here is comparable. Re-run; do not read the cells.`,
        }));
    }

    for (const key of Object.keys(before)) {
        if (!(key in after)) {
            moved.push({ key, note: 'MISSING from the later capture' });
            continue;
        }
        if (before[key] === after[key]) continue;
        const [label, a] = before[key].split('\t');
        const b = after[key].split('\t')[1];
        const av = a.split('|'), bv = b.split('|');
        moved.push({
            key,
            label,
            changed: PROPS.map((p, i) => (av[i] !== bv[i] ? `${p}: ${av[i]} -> ${bv[i]}` : null)).filter(Boolean),
        });
    }
    for (const key of Object.keys(after)) {
        if (!(key in before)) moved.push({ key, note: 'NEW in the later capture' });
    }
    return moved;
}

/**
 * CONTROL — run before trusting a capture.
 *
 * Proves the forcing mechanism actually does something: if NO element on a surface
 * responds to a forced state, either CDP is not reaching the page or the surface
 * did not mount, and a clean interaction diff would mean nothing. Verified
 * 2026-09-08 on the dashboard: the "All Projects" button's background moves
 * rgb(48,48,48) -> rgb(75,75,75) under forced hover.
 */
function assertForcingWorks(capture) {
    const bySurface = {};
    for (const [key, val] of Object.entries(capture)) {
        const [surface, idx, state] = key.split('|');
        if (state === 'rest') continue;
        const rest = capture[`${surface}|${idx}|rest`];
        if (rest && rest !== val) bySurface[surface] = (bySurface[surface] || 0) + 1;
    }
    const responsive = Object.keys(bySurface).length;
    if (responsive === 0) {
        throw new Error(
            'no element on any surface responded to a forced pseudo-state — the forcing ' +
            'mechanism is not working, and a clean diff here would be meaningless.'
        );
    }
    return { surfacesWithResponsiveElements: responsive, perSurface: bySurface };
}
