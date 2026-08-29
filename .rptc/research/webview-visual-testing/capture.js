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
];

const SURFACES = [
    'wizard', 'dashboard', 'configure', 'sidebar',
    'projectsList', 'aiOverview', 'integrations', 'dataInstaller',
];

/** Settle time per surface. Generous on purpose; a short one reads as a diff. */
const SETTLE_MS = 2600;

async function captureSurface(bundle) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1280px;height:900px;border:0;position:absolute;left:-9999px';
    // CACHE-BUST, or the browser serves the previous build and a before/after
    // comparison silently compares a build against ITSELF. The harness forwards
    // `cb` to the bundle URL for the same reason.
    frame.src = `/h.html?b=${bundle}&cb=${Date.now()}${Math.floor(Math.random() * 1e6)}`;
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
    return lines;
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
    if (problems.length) throw new Error('HARNESS NOT FAITHFUL: ' + problems.join('; '));
    return 'harness faithful';
}

/** Capture every surface. Returns { surface: string[] }. */
async function capture() {
    await assertHarnessFaithful();
    const out = {};
    for (const s of SURFACES) out[s] = await captureSurface(s);
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
