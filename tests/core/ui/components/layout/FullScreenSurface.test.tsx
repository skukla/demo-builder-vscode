/**
 * FullScreenSurface tests
 *
 * The point of this suite is the CLASS NAMES, not the composition. Four surfaces
 * used to inline this markup; now one component emits it, and the stylesheet
 * that paints it matches on `.projects-sticky-header`, `.page-container-padded`
 * and `.page-header-section` by literal name.
 *
 * Those names are checked NOWHERE else against this component. The two existing
 * guards — `pageContentAlignment` and `DashboardStatusHeader-layout` — parse
 * `custom-spectrum.css` as TEXT, so they prove the RULES exist, never that
 * anything renders an element they select. Rename a class here and jsdom (which
 * resolves no layout) reports four perfectly healthy, entirely unstyled screens.
 * This suite is the other half of that pair.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { FullScreenSurface } from '@/core/ui/components/layout/FullScreenSurface';

describe('FullScreenSurface', () => {
    it('renders the header inside the sticky band and the children in the body', () => {
        const { container } = render(
            <FullScreenSurface header={<span>the header</span>}>
                <p>the body</p>
            </FullScreenSurface>
        );

        const band = container.querySelector('.projects-sticky-header');
        expect(band).not.toBeNull();
        expect(band).toContainElement(screen.getByText('the header'));
        expect(band).not.toContainElement(screen.getByText('the body'));
    });

    it('constrains the header with .page-container-padded.page-header-section', () => {
        const { container } = render(
            <FullScreenSurface header={<span>the header</span>}>
                <p>the body</p>
            </FullScreenSurface>
        );

        const section = container.querySelector(
            '.projects-sticky-header > .page-container-padded.page-header-section'
        );
        expect(section).not.toBeNull();
        expect(section).toContainElement(screen.getByText('the header'));
    });

    it('constrains the body with .page-container-padded.pb-6, outside the band', () => {
        const { container } = render(
            <FullScreenSurface header={<span>the header</span>}>
                <p>the body</p>
            </FullScreenSurface>
        );

        const body = container.querySelector('.page-container-padded.pb-6');
        expect(body).not.toBeNull();
        expect(body).toContainElement(screen.getByText('the body'));
        // A fragment, not a wrapper: the band is the body's SIBLING. Nesting the
        // body inside the sticky band would pin the whole page open at the top.
        expect(body?.closest('.projects-sticky-header')).toBeNull();
    });
});
