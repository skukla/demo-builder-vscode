/**
 * Phase 5 — what the guidance skills must SAY, not merely that they ship.
 *
 * A skill file is content, so nothing else in the suite can notice when it goes
 * stale against the tool surface it describes. These pin the two claims that
 * were actually wrong or missing, each tied to a defect rather than to a style:
 *
 * - `diagnose-demo` routed "product page renders empty" — the first symptom it
 *   names — to `get_store_structure` and then to the Commerce admin. The classic
 *   cause is a refused Configuration Service write, which leaves a storefront
 *   that builds, pushes and browses and serves no product page. An agent
 *   following the old table found scope healthy and reported an empty catalog
 *   while the catalog was fine.
 * - `import-datapack`'s worst trap is that `start_datapack_import` returns a
 *   RECEIPT. Reporting it as an outcome is invisible: the user sees "imported"
 *   and an empty catalog.
 *
 * Asserted against the TEMPLATE contents the writer actually ships, so a skill
 * edited in isolation cannot drift from what is delivered.
 */

import { DEMO_BUILDER_SKILLS } from '@/features/project-creation/services/aiBundle/skillsWriter';
import { DEMO_BUILDER_ALWAYS_ON_SKILLS } from '@/types/ai';

function skill(filename: string): string {
    const entry = DEMO_BUILDER_SKILLS.find((s) => s.filename === filename);
    if (!entry) throw new Error(`No skill template named ${filename}`);
    return entry.content;
}

// Control: without this, a typo'd filename in every test below would throw and
// the suite would report the failure as a missing skill rather than a bad test.
it('control: the template lookup finds a skill that has always existed', () => {
    expect(skill('diagnose-demo.md').length).toBeGreaterThan(500);
});

describe('diagnose-demo routes the empty-product-page symptom correctly', () => {
    const content = () => skill('diagnose-demo.md');

    it('sends the PDP symptom to the site-config check FIRST', () => {
        const table = content().slice(content().indexOf('| Symptom'));
        const pdpRow = table.split('\n').find((l) => /Product page renders empty/.test(l));

        expect(pdpRow).toBeDefined();
        expect(pdpRow).toContain('get_site_access');
    });

    it('still reaches store scope, but as the SECOND step', () => {
        const c = content();
        expect(c).toContain('get_store_structure');
        // Order is the whole fix: the site-config check must appear before the
        // scope check in the routing table.
        expect(c.indexOf('get_site_access')).toBeLessThan(c.indexOf('get_store_structure'));
    });

    it('names the repair and says it does not publish', () => {
        const c = content();
        expect(c).toContain('repair_site_configuration');
        // Stopping at `repaired` and reporting the storefront fixed is the
        // mistake `nextStep` exists to prevent.
        expect(c).toMatch(/does not publish|nextStep/i);
    });

    it('knows the Group 1 diagnosis tools that did not exist when it was written', () => {
        const c = content();
        for (const tool of [
            'get_project_status',
            'check_prerequisites',
            'check_github_app',
            'check_repo_readiness',
        ]) {
            expect(c).toContain(tool);
        }
    });

    /**
     * The second wrong route in this file, found the same way as the first.
     *
     * "Catalog is empty everywhere" pointed at store scope and then the Commerce
     * admin. But `docs/systems/data-installer.md` records that `GET /V1/categories`
     * returns only the DEFAULT store group's subtree, so on a multi-root instance
     * a successful import reads as a no-op through that endpoint "while
     * `per-type: success` is telling the truth". An agent checking scope finds it
     * healthy and reports an empty catalog that is not empty.
     *
     * The cause is a root category that was never assigned to the store — a
     * post-import Admin step the vendor documents and nothing here mentioned.
     */
    it('names an unassigned root category as a cause of an empty catalog', () => {
        const c = content();
        // NOT a bare /root categor/ — that matched even after the sentence
        // carrying the claim was gutted, because the words survive elsewhere.
        // Pin the two claims that make this actionable instead.
        expect(c).toMatch(/does not attach it to a store/i);
        // The distinguishing check: the flat search is what shows reality when
        // the tree endpoint hides it.
        expect(c).toMatch(/categories\/list|flat search/i);
        // And the instruction that stops the wrong instinct.
        expect(c).toMatch(/rather than re-importing/i);
    });

    it('can ask whether a feature is off rather than broken', () => {
        // Two settings are functional gates; without this the skill cannot tell
        // "absent" from "unconfigured".
        expect(content()).toContain('get_settings');
    });
});

describe('import-datapack teaches the traps, not just the sequence', () => {
    const content = () => skill('import-datapack.md');

    it('ships as an always-on skill', () => {
        expect([...DEMO_BUILDER_ALWAYS_ON_SKILLS]).toContain('import-datapack.md');
    });

    it('says the start call returns a handle and must be polled', () => {
        const c = content();
        expect(c).toContain('start_datapack_import');
        expect(c).toContain('get_datapack_import_status');
        // NOT `/receipt|handle/` — that matched the one-line sequence block, so
        // gutting the whole trap section still passed. Pin the two sentences
        // that carry the warning instead.
        expect(c).toMatch(/receipt, not an outcome/i);
        expect(c).toMatch(/Reporting success from the start call/i);
    });

    it('forbids guessing the target instance', () => {
        const c = content();
        expect(c).toContain('get_datapack_import_target');
        // The handler refuses to default it for this reason; the skill must
        // carry the reason, not just the requirement. Matched on the tail of the
        // quote — it wraps across a blockquote line, so the full sentence is not
        // contiguous in the source.
        expect(c).toMatch(/live demo/i);
        expect(c).toMatch(/deliberately NOT defaulted/i);
    });

    it('names every argument that is required but reads optional', () => {
        const c = content();
        for (const arg of ['datapackName', 'version', 'commerceInstance', 'dataTypes']) {
            expect(c).toContain(arg);
        }
        // "omit for latest" and "omit for all" are both wrong, and both are the
        // natural assumption.
        expect(c).toMatch(/no "latest"/i);
    });

    it('warns that reset cannot be undone', () => {
        const c = content();
        expect(c).toContain('reset_datapack');
        expect(c).toMatch(/cannot be undone/i);
    });

    it('flags the shared catalog on export', () => {
        const c = content();
        expect(c).toContain('start_datapack_export');
        expect(c).toMatch(/other teams/i);
    });

    /**
     * From the feature's author, and both verified against the code before being
     * written down. They are the two places the skill was WRONG rather than thin.
     */
    it('says reset is scoped to the pack, not an instance wipe', () => {
        const c = content();
        // "cannot be undone" and "unbounded" are different claims and only the
        // first is true. An agent told the second refuses a safe operation.
        expect(c).toMatch(/import in reverse/i);
        // Matched on the distinctive phrase alone, not the full sentence: prose
        // in these files wraps, so a multi-word regex spanning a line break
        // fails for a reason that has nothing to do with the claim.
        expect(c).toMatch(/instance wipe/i);
    });

    it('says EXPORT is the one operation the caller must order', () => {
        const c = content();
        // `startDelete`'s own comment: the service supplies dependency ordering
        // for import and delete. Export has no such guarantee, so exporting
        // types individually in the wrong order is on the caller.
        expect(c).toMatch(/attributes before products/i);
        expect(c).toContain('list_datapack_data_types');
        expect(c).toMatch(/operationMode.*export|export.*operationMode/i);
    });

    /**
     * Instance-level gotchas, which are NOT data type dependencies.
     *
     * Deliberately here and not in the modal. None is detectable — no module
     * status read exists for B2B, and nothing can tell whether this pack's cart
     * rules name a segment — so a modal warning would fire mostly when it did
     * not apply. This project already rejected that shape once: the
     * customer-groups warning was scoped to fire only when the pack actually
     * offered the type, because "a warning naming an unavailable type is noise".
     *
     * A skill is read when planning, once, by something that can then ask.
     */
    it('names the instance prerequisites the service documents', () => {
        const c = content();
        // B2B: the import fails outright without it.
        expect(c).toMatch(/B2B/);
        expect(c).toMatch(/Admin/i);
        // Customer segments: the rule installs and is silently broken.
        expect(c).toMatch(/segment/i);
    });

    it('says a re-export rewrites rather than duplicates', () => {
        // This is what makes a wrong-order export recoverable, and without it an
        // agent would treat the mistake as needing a fresh pack.
        expect(content()).toMatch(/rewrites the previous/i);
    });
});
