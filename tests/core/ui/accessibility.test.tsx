/**
 * WCAG checks on the shared UI vocabulary, via axe-core.
 *
 * The root CLAUDE.md asks for WCAG 2.1 AA on significant UI work. Before this file
 * that standard was stated and enforced by nothing: the repo carried no
 * accessibility tooling at all, verified against package.json on 2026-09-06 ([[PL-47]]).
 *
 * WHY HERE AND NOT IN THE BROWSER HARNESS. PL-47 assumed axe needed a real browser
 * and proposed bolting it onto `webview-visual-baseline`. It does not: 195 of the
 * 211 rendering suites in this repo already mount REAL Spectrum in jsdom, so the
 * expensive part is already paid on every run. The browser is still the only place
 * `color-contrast` can be judged (below), and that half remains PL-47's.
 *
 * THREE THINGS THIS FILE HAD TO LEARN THE HARD WAY, all recorded because each
 * presents as a hang or a vacuous pass rather than an error:
 *
 * 1. REAL TIMERS MUST BE RESTORED IN `beforeEach`, NOT `beforeAll`.
 *    `tests/setup/react.ts` calls `jest.useFakeTimers()` in its OWN `beforeEach`,
 *    which runs before this file's. Restoring real timers in `beforeAll` is
 *    therefore undone before every test, and `axe.run()` — which yields between
 *    rules — never settles. It times out at whatever the jest timeout is, with no
 *    indication that timers are the cause. Five probes were spent on this.
 *
 * 2. `color-contrast` CANNOT RUN HERE and is disabled explicitly rather than left
 *    to fail quietly. jsdom has no layout or paint, so axe cannot measure a
 *    rendered colour. Leaving it enabled produces `incomplete` results that read
 *    like passes. Contrast belongs to the browser harness.
 *
 * 3. ZERO VIOLATIONS IS NOT A PASS ON ITS OWN. A component that renders through a
 *    portal, or fails to mount, puts nothing in the container — and axe then
 *    reports zero violations because it inspected nothing. `LoadingOverlay` did
 *    exactly that in the sizing probe: 0 violations, 0 passes. Every case below
 *    asserts the PASS count as well, so a vacuous result fails.
 *
 * WHAT SPECTRUM GIVES FREE, AND WHAT IT DOES NOT. Every component checked here came
 * back clean on the first run, which is the expected result: Spectrum handles roles,
 * names and keyboard semantics for its own primitives. What it cannot handle is
 * COMPOSITION — a label bound to the wrong control, a live region that never
 * announces, a focus order following the DOM rather than the reading order. Those
 * are ours, and they only appear as this list grows toward the composed surfaces.
 *
 * TO EXTEND: add a row to CASES. Keep the props realistic; a component rendered
 * without the props it is normally given can pass here and fail in the product.
 */

import React from 'react';
import axe from 'axe-core';
import { renderWithProviders } from '../../helpers/react-test-utils';
import { StatusCard } from '@/core/ui/components/feedback/StatusCard';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { FormField } from '@/core/ui/components/forms/FormField';

jest.setTimeout(60000);

// See note 1. This MUST be beforeEach.
beforeEach(() => {
    jest.useRealTimers();
});

interface Audit {
    violations: string[];
    passes: number;
}

async function audit(ui: React.ReactElement): Promise<Audit> {
    const { container } = renderWithProviders(ui);
    const res = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } }, // see note 2
    });
    return {
        violations: res.violations.map((v) => `${v.id} (${v.nodes.length} node(s))`),
        passes: res.passes.length,
    };
}

/** Component under test, with the props it is realistically given. */
const CASES: ReadonlyArray<readonly [string, React.ReactElement]> = [
    ['StatusCard', <StatusCard status="Running" color="green" />],
    ['EmptyState', <EmptyState title="No projects yet" description="Create one to get started" />],
    ['LoadingDisplay', <LoadingDisplay message="Loading projects" />],
    [
        'FormField',
        <FormField
            fieldKey="username"
            label="Username"
            type="text"
            value="john"
            onChange={() => {}}
        />,
    ],
];

describe('the shared UI vocabulary meets WCAG where jsdom can judge it', () => {
    it('CONTROL: the detector fires on markup with known faults', async () => {
        // Without this, a clean sweep below is indistinguishable from a probe that
        // inspects nothing — the exact failure shape note 3 describes.
        const Bad = () => (
            <div>
                <img src="x.png" />
                <input type="text" />
            </div>
        );
        const { violations } = await audit(<Bad />);

        expect(violations.map((v) => v.split(' ')[0]).sort()).toStrictEqual(['image-alt', 'label']);
    });

    it.each(CASES)('%s has no violations, and was actually inspected', async (_name, ui) => {
        const { violations, passes } = await audit(ui);

        // Both halves matter: an empty violation list proves nothing if axe found
        // nothing to check.
        expect({ violations, inspected: passes > 0 }).toStrictEqual({
            violations: [],
            inspected: true,
        });
    });
});
