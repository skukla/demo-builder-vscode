/**
 * Capture a computed-style fingerprint of every webview surface (PL-21 / ADR-018).
 *
 * Run this INSIDE a browser already pointed at the harness — it is the body of a
 * `browser_evaluate` call, not a node script, because the driver today is the
 * MCP Playwright browser. See README.md for the whole procedure.
 *
 *     const before = await capture();      // baseline
 *     // ... change CSS, rebuild, refresh bundles ...
 *     const after  = await capture();
 *     diff(before, after)                  // empty === behaviour-preserving
 *
 * WHAT A FINGERPRINT IS. Every element from `body`, keyed by structural path,
 * with 23 computed properties. Not a screenshot: exact string equality, no pixel
 * tolerance, no font drift — and it catches cascade and specificity changes,
 * which is what this codebase's CSS failures actually are.
 */

const PROPS = [
    'color', 'background-color', 'font-size', 'font-weight', 'padding', 'margin',
    'display', 'position', 'width', 'height', 'border', 'flex-direction',
    'align-items', 'justify-content', 'opacity', 'text-align',
    // Added after auditing ADR-018: 467 declarations live in these, 108 of them
    // carrying `!important`, and the original 16-property list could not see any
    // of them — so an `!important` sweep would have reported clean either way.
    'box-shadow', 'border-radius', 'z-index', 'transform', 'overflow', 'outline', 'gap',
    // Added 2026-09-08 by PL-21 phase 2. The audit found three duplicated utility
    // classes whose two definitions genuinely disagree, and one of them is
    // `.letter-spacing-05`. With letter-spacing uncaptured, deleting the losing
    // definition produced an empty diff — the instrument reporting clean because it
    // was not looking, which is the exact failure the 23rd property was added to
    // stop. `text-transform` and `line-height` join it: `.text-uppercase` is
    // duplicated the same way, and a unitless line-height moves whenever font-size
    // does, so capturing font-size without it tells half the story.
    'letter-spacing', 'text-transform', 'line-height',
];

/**
 * The smallest real surface is aiOverview at 30 elements, so a cell under this
 * floor did not mount. See the throw in captureSurface for why a floor exists.
 */
const MIN_ELEMENTS = 20;

const SURFACES = [
    'wizard', 'dashboard', 'configure', 'sidebar',
    'projectsList', 'aiOverview', 'integrations', 'dataInstaller',
];

/**
 * The two axes the fingerprint was blind to until 2026-09-08 (PL-47 steps 2-3).
 *
 * THEMES, AND WHY THE POINT IS THE OPPOSITE OF WHAT IT LOOKS LIKE. PL-47 assumed
 * the extension inherits the user's VS Code theme. It does not: `WebviewApp` and
 * the sidebar entry both force `vscode-dark` onto the body, and the owner
 * confirmed on 2026-09-08 that imposing one theme on every user is deliberate.
 *
 * So this axis is not a light/dark regression check. It is a guard that the
 * IMPOSITION HOLDS. VS Code still supplies its own `--vscode-*` variables from
 * whatever theme the user picked, and our CSS reads 13 of them, so a light-theme
 * user is where the imposed theme could leak. Measured on the dashboard the same
 * day: 68 app elements, byte-identical colours under both — the imposition holds
 * today, and a diff between the two theme captures is what would show it slipping.
 *
 * The harness reads `?t=` and applies real VS Code palettes — see its comment for
 * why high contrast is absent.
 *
 * WIDTHS. VS Code panels resize, and the capture ran at 1280 only. 420 is the
 * load-bearing one: the root CLAUDE.md records that Spectrum's Flex constrains at
 * 450px, which is a bug class a single-width capture is structurally incapable of
 * seeing. 900 is a normal editor column; 1280 is the historical baseline, kept so
 * old fingerprints stay comparable.
 */
const THEMES = ['dark', 'light'];
const WIDTHS = [420, 900, 1280];

/** Settle time per surface. Generous on purpose; a short one reads as a diff. */
const SETTLE_MS = 2600;

async function captureSurface(bundle, theme = 'dark', width = 1280) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = document.createElement('iframe');
    frame.style.cssText = `width:${width}px;height:900px;border:0;position:absolute;left:-9999px`;
    // CACHE-BUST, or the browser serves the previous build and a before/after
    // comparison silently compares a build against ITSELF. The harness forwards
    // `cb` to the bundle URL for the same reason.
    frame.src = `/h.html?b=${bundle}&t=${theme}&cb=${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    document.body.appendChild(frame);
    await wait(SETTLE_MS);

    const doc = frame.contentDocument;
    const win = frame.contentWindow;

    // Pin animations before reading. The CSS freeze alone is not enough:
    // `.animate-pulse` is `!important` inside `@layer theme`, and a layered
    // `!important` beats an unlayered one — ADR-018 §1, biting the instrument
    // built to help fix it.
    if (win.__FREEZE__) win.__FREEZE__();

    const lines = [];
    const walk = (el, path) => {
        const cs = win.getComputedStyle(el);
        lines.push(`${path}\t${el.tagName}\t${PROPS.map((p) => cs.getPropertyValue(p)).join('|')}`);
        [...el.children].forEach((child, i) => walk(child, `${path}/${i}`));
    };
    walk(doc.body, '');

    frame.remove();

    // PER-CELL FLOOR. `assertHarnessFaithful()` checks the dashboard ONCE, at the
    // start of a run, so an individual cell that fails to mount is recorded as a
    // legitimate fingerprint. On 2026-09-08 a baseline captured wizard@dark@1280
    // with SIX elements against its usual 105 and the diff reported it as a moved
    // element — visible only because the count changed. The dangerous direction is
    // the quiet one: a cell that under-renders in BOTH captures compares identical
    // and reports clean. A real surface here never renders under 30 elements (the
    // smallest, aiOverview, is 30), so anything under 20 is a failed mount.
    if (lines.length < MIN_ELEMENTS) {
        throw new Error(
            `capture ${bundle}@${theme}@${width} produced ${lines.length} elements ` +
            `(floor ${MIN_ELEMENTS}) — the surface did not mount. Re-run; do not diff this.`
        );
    }

    return lines;
}

/**
 * Every CSS property a change TOUCHES must be in PROPS, or the diff cannot see it.
 *
 * Pass the CSS text being removed or edited. Added 2026-09-08 after two blind
 * spots in one day: letter-spacing was not captured, so deleting a
 * letter-spacing rule produced an empty diff that proved nothing. Reasoning about
 * whether the fingerprint covers a change is exactly the step that failed; this
 * makes it a check.
 */
function assertPropertiesCovered(cssText) {
    const declared = new Set(
        [...cssText.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:/g)].map((m) => m[1])
    );
    const blind = [...declared].filter((p) => !PROPS.includes(p));
    if (blind.length) {
        throw new Error(
            `the fingerprint does not capture: ${blind.join(', ')}. ` +
            `Add them to PROPS before trusting a diff of this change.`
        );
    }
    return { covered: [...declared] };
}

/**
 * FAITHFULNESS CONTROL — run before trusting any capture.
 *
 * An unmounted or unstyled harness produces a clean-looking fingerprint full of
 * inherited defaults, and a diff against it reports a screenful of regressions
 * that do not exist. Abort rather than report.
 */
async function assertHarnessFaithful() {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1280px;height:900px;border:0;position:absolute;left:-9999px';
    frame.src = `/h.html?b=dashboard&cb=ctl${Date.now()}`;
    document.body.appendChild(frame);
    await wait(SETTLE_MS);
    const doc = frame.contentDocument, win = frame.contentWindow;

    const problems = [];
    if (doc.getElementById('root').children.length === 0) problems.push('app did not MOUNT');

    // A Spectrum variable must resolve somewhere, or every themed rule is dead.
    let themed = null;
    for (const el of doc.querySelectorAll('*')) {
        if (win.getComputedStyle(el).getPropertyValue('--spectrum-global-color-orange-600').trim()) {
            themed = el;
            break;
        }
    }
    if (!themed) problems.push('no Spectrum theme scope — themed rules will read as broken');

    // And one of OUR rules must apply.
    const padded = doc.querySelector('.page-container-padded');
    if (padded && win.getComputedStyle(padded).paddingLeft === '0px') {
        problems.push('our stylesheets are not applying');
    }
    if (win.__FIXTURE_ERROR__) problems.push(`fixtures failed to load: ${win.__FIXTURE_ERROR__}`);

    frame.remove();

    // THE THEME AXIS NEEDS ITS OWN CONTROL, and it is the one most worth having.
    // If `?t=light` silently did nothing, every light capture would be byte-equal
    // to its dark twin, every theme diff would be empty, and the run would report
    // "no theme-dependent bugs" — a false all-clear that looks exactly like a
    // clean result. So: load the same surface twice and require the rendered
    // background to actually differ.
    const bg = async (theme) => {
        const f = document.createElement('iframe');
        f.style.cssText = 'width:900px;height:600px;border:0;position:absolute;left:-9999px';
        f.src = `/h.html?b=dashboard&t=${theme}&cb=ctl${theme}${Date.now()}`;
        document.body.appendChild(f);
        await wait(SETTLE_MS);
        const v = f.contentWindow.getComputedStyle(f.contentDocument.body).backgroundColor;
        f.remove();
        return v;
    };
    const darkBg = await bg('dark');
    const lightBg = await bg('light');
    if (darkBg === lightBg) {
        problems.push(`theme switch is INERT — dark and light both render ${darkBg}`);
    }

    if (problems.length) throw new Error('HARNESS NOT FAITHFUL: ' + problems.join('; '));
    return `harness faithful (dark ${darkBg} vs light ${lightBg})`;
}

/**
 * Capture every surface, at every theme and width.
 *
 * Keys are `surface@theme@width`, so `diff()` needs no change: it compares by key
 * and a cell present in one capture and missing from the other is reported as
 * such. A run is 8 x 2 x 3 = 48 loads at the settle time above, so budget a
 * couple of minutes; pass a narrower matrix while iterating on one surface.
 */
async function capture({ surfaces = SURFACES, themes = THEMES, widths = WIDTHS } = {}) {
    await assertHarnessFaithful();
    const out = {};
    for (const s of surfaces) {
        for (const t of themes) {
            for (const w of widths) {
                out[`${s}@${t}@${w}`] = await captureSurface(s, t, w);
            }
        }
    }
    return out;
}

/** Diff two captures; returns the moved elements, named by property. */
function diff(before, after) {
    const moved = [];
    for (const surface of Object.keys(before)) {
        const a = before[surface], b = after[surface];
        if (!b) { moved.push({ surface, note: 'MISSING from the later capture' }); continue; }
        if (a.length !== b.length) {
            moved.push({ surface, note: `element count ${a.length} -> ${b.length}` });
            continue;
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i] === b[i]) continue;
            const [path, tag, av] = a[i].split('\t');
            const bv = b[i].split('\t')[2];
            const before_ = av.split('|'), after_ = bv.split('|');
            const changed = PROPS
                .map((p, k) => (before_[k] !== after_[k] ? `${p}: ${before_[k]} -> ${after_[k]}` : null))
                .filter(Boolean);
            moved.push({ surface, tag, path, changed });
        }
    }
    return moved;
}

/**
 * WCAG COLOUR CONTRAST — the one accessibility rule jsdom cannot judge.
 *
 * `tests/core/ui/accessibility.test.tsx` runs axe on every render in the jest
 * suite and explicitly DISABLES `color-contrast`, because jsdom has no layout or
 * paint and therefore no rendered colour to measure. This is the other half: the
 * same rule, in a real browser, against the real built bundle.
 *
 * Requires `axe.min.js` staged beside the harness (see SKILL.md step 2). Injected
 * into each iframe rather than into the harness itself, so an ordinary fingerprint
 * capture stays untouched by a 500KB script.
 *
 * Contrast is measured at the DARK theme only by default, and that is not laziness:
 * the extension imposes `vscode-dark` on every user deliberately, so the dark
 * rendering is the only one a person actually sees. Pass a theme to check that the
 * imposition has not slipped.
 */
async function auditContrast({ surfaces = SURFACES, theme = 'dark', width = 1280 } = {}) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    for (const bundle of surfaces) {
        const frame = document.createElement('iframe');
        frame.style.cssText = `width:${width}px;height:900px;border:0;position:absolute;left:-9999px`;
        frame.src = `/h.html?b=${bundle}&t=${theme}&cb=ax${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        document.body.appendChild(frame);
        await wait(SETTLE_MS);

        const doc = frame.contentDocument, win = frame.contentWindow;
        if (win.__FREEZE__) win.__FREEZE__();

        // Inject axe INTO the frame: it must run in the same document whose
        // computed colours it is measuring.
        await new Promise((res, rej) => {
            const sc = doc.createElement('script');
            sc.src = '/axe.min.js';
            sc.onload = res;
            sc.onerror = () => rej(new Error('axe.min.js not staged beside the harness'));
            doc.head.appendChild(sc);
        });

        const res = await win.axe.run(doc.getElementById('root'), {
            runOnly: { type: 'rule', values: ['color-contrast'] },
        });

        out[`${bundle}@${theme}@${width}`] = {
            violations: res.violations.map((v) => ({
                impact: v.impact,
                nodes: v.nodes.map((n) => ({
                    target: n.target.join(' '),
                    summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(-1)[0] || '',
                })),
            })),
            // A zero with nothing checked is not a pass. axe reports what it could
            // not decide separately, and both matter.
            passes: res.passes.length,
            incomplete: res.incomplete.length,
        };
        frame.remove();
    }
    return out;
}
