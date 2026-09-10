/**
 * BrandGallery — what a card SHOWS about the choice it represents.
 *
 * The gallery is mark-and-Continue: a click records the package and the wizard moves
 * on. Everything else a card carries is derived state — selected, dimmed, complete,
 * the architecture it resolved, the block libraries it summarises — and each of those
 * is a decision this suite constrains.
 *
 * The class names ARE the behaviour here: `selected`, `dimmed`, `expanded`, `complete`
 * are what the stylesheet reads, so a flag that stops reaching `cn` is a card that
 * stops looking chosen with nothing else failing (ADR-017: a feature stylesheet and
 * the component that names its classes are checked in different places, or not at all).
 *
 * Spectrum is stubbed globally via jest `moduleNameMapper`; the catalog arrives as
 * props, so no bundled JSON is involved.
 */

import { fireEvent, screen } from '@testing-library/react';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { PACKAGES, cardFor, cards, renderGallery } from './BrandGallery.testUtils';
import '@testing-library/jest-dom';

const CUSTOM_LIBRARY: CustomBlockLibrary = {
    name: 'My Own Blocks',
    source: { owner: 'me', repo: 'my-blocks', branch: 'main' },
};

describe('BrandGallery — selection and dimming', () => {
    it('marks the chosen card and dims every other one', () => {
        const { container } = renderGallery({ selectedPackage: 'other-brand' });

        const chosen = cardFor('Other Brand');
        expect(chosen).toHaveClass('selected');
        expect(chosen).toHaveAttribute('data-selected', 'true');
        expect(chosen).not.toHaveClass('dimmed');
        expect(chosen).toHaveAttribute('data-dimmed', 'false');

        const passedOver = cardFor('Active Brand');
        expect(passedOver).not.toHaveClass('selected');
        expect(passedOver).toHaveAttribute('data-selected', 'false');
        expect(passedOver).toHaveClass('dimmed');
        expect(passedOver).toHaveAttribute('data-dimmed', 'true');

        expect(container.querySelectorAll('.selection-check')).toHaveLength(1);
    });

    it('dims nothing at all before a package is chosen', () => {
        const { container } = renderGallery();

        expect(cards()).toHaveLength(PACKAGES.length);
        for (const card of cards()) {
            expect(card).not.toHaveClass('dimmed');
            expect(card).toHaveAttribute('data-dimmed', 'false');
            expect(card).toHaveAttribute('data-selected', 'false');
        }
        expect(container.querySelectorAll('.selection-check')).toHaveLength(0);
    });
});

describe('BrandGallery — the architecture a complete card names', () => {
    it('resolves the chosen stack and names it on the chosen card only', () => {
        renderGallery({ selectedPackage: 'other-brand', selectedStack: 'eds-paas' });

        const chosen = cardFor('Other Brand');
        expect(chosen).toHaveClass('expanded');
        expect(chosen).toHaveClass('complete');
        expect(screen.getByText('Architecture: EDS + PaaS')).toBeInTheDocument();

        const passedOver = cardFor('Active Brand');
        expect(passedOver).not.toHaveClass('expanded');
        expect(passedOver).not.toHaveClass('complete');
    });

    it('names nothing when the stack id is not one the catalog carries', () => {
        renderGallery({ selectedPackage: 'other-brand', selectedStack: 'retired-stack' });

        expect(cardFor('Other Brand')).not.toHaveClass('complete');
        expect(screen.queryByText(/^Architecture:/)).not.toBeInTheDocument();
    });

    it('names nothing when a package is chosen but no stack is', () => {
        renderGallery({ selectedPackage: 'other-brand' });

        expect(cardFor('Other Brand')).not.toHaveClass('complete');
        expect(screen.queryByText(/^Architecture:/)).not.toBeInTheDocument();
    });

    it('re-resolves when the chosen stack changes', () => {
        const { rerenderWith } = renderGallery({
            selectedPackage: 'other-brand',
            selectedStack: 'headless-paas',
        });
        expect(screen.getByText('Architecture: Headless + PaaS')).toBeInTheDocument();

        rerenderWith({ selectedStack: 'eds-paas' });

        expect(screen.getByText('Architecture: EDS + PaaS')).toBeInTheDocument();
    });
});

describe('BrandGallery — the block-library summary on a complete card', () => {
    const complete = { selectedPackage: 'other-brand', selectedStack: 'eds-paas' };

    it('counts the catalog libraries and the custom ones together', () => {
        renderGallery({
            ...complete,
            selectedBlockLibraries: ['commerce-blocks'],
            customBlockLibraries: [CUSTOM_LIBRARY],
        });

        expect(document.querySelector('.brand-card-detail-link')?.textContent).toBe(
            '2 block libraries',
        );
        // Both sources are named in the hover detail, not just counted.
        expect(screen.getByText('commerce-blocks')).toBeInTheDocument();
        expect(screen.getByText('My Own Blocks')).toBeInTheDocument();
    });

    it('says "library", singular, for exactly one', () => {
        renderGallery({ ...complete, selectedBlockLibraries: ['commerce-blocks'] });

        expect(document.querySelector('.brand-card-detail-link')?.textContent).toBe(
            '1 block library',
        );
    });

    it('says nothing when no libraries were chosen', () => {
        renderGallery(complete);

        expect(document.querySelector('.brand-card-detail-link')).toBeNull();
        expect(screen.queryByText('Block Libraries')).not.toBeInTheDocument();
    });
});

describe('BrandGallery — coming-soon cards', () => {
    it('badges only the coming-soon card', () => {
        renderGallery();

        expect(screen.getAllByText('Coming Soon')).toHaveLength(1);
        expect(cardFor('Soon Brand')).toHaveClass('coming-soon');
        expect(cardFor('Active Brand')).not.toHaveClass('coming-soon');
    });

    it('takes a coming-soon card out of the tab order and leaves the others in it', () => {
        renderGallery();

        expect(cardFor('Soon Brand')).toHaveAttribute('tabindex', '-1');
        expect(cardFor('Active Brand')).toHaveAttribute('tabindex', '0');
    });

    it('refuses the keyboard activation it accepts on an active card', () => {
        const { props } = renderGallery();

        fireEvent.keyDown(cardFor('Soon Brand'), { key: 'Enter' });
        expect(props.onPackageSelect).not.toHaveBeenCalled();

        fireEvent.keyDown(cardFor('Active Brand'), { key: 'Enter' });
        expect(props.onPackageSelect).toHaveBeenCalledWith('active-brand');
    });
});

describe('BrandGallery — the header and the search', () => {
    it('reports how many packages the catalog holds', () => {
        renderGallery();

        expect(screen.getByText(/3 packages/)).toBeInTheDocument();
    });

    it('calls the handler it was given NOW, not the one from the first render', () => {
        const laterHandler = jest.fn();
        const { props, rerenderWith } = renderGallery();

        rerenderWith({ onPackageSelect: laterHandler });
        fireEvent.click(cardFor('Active Brand'));

        expect(laterHandler).toHaveBeenCalledWith('active-brand');
        expect(props.onPackageSelect).not.toHaveBeenCalled();
    });

    it('says so when a filter matches nothing', () => {
        renderGallery();

        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });

        expect(screen.getByText(/No packages match/)).toBeInTheDocument();
        expect(cards()).toHaveLength(0);
    });

    it('stays quiet when the filter matches something', () => {
        renderGallery();

        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Other' } });

        expect(cards()).toHaveLength(1);
        expect(screen.queryByText(/No packages match/)).not.toBeInTheDocument();
    });

    it('stays quiet when nothing has been typed', () => {
        renderGallery();

        expect(screen.queryByText(/No packages match/)).not.toBeInTheDocument();
    });
});
