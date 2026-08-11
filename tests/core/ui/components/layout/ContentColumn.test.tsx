/**
 * ContentColumn — the canonical single content column. Renders children inside the
 * `.content-column` wrapper (left-aligned, capped at --content-width via CSS).
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ContentColumn } from '@/core/ui/components/layout/ContentColumn';

describe('ContentColumn', () => {
    it('wraps children in the .content-column layout', () => {
        const { container, getByText } = render(
            <ContentColumn>
                <p>hello</p>
            </ContentColumn>,
        );
        const col = container.querySelector('.content-column');
        expect(col).toBeInTheDocument();
        expect(getByText('hello')).toBeInTheDocument();
        expect(col).toContainElement(getByText('hello'));
    });

    it('merges an additional className', () => {
        const { container } = render(
            <ContentColumn className="container-wizard">
                <p>x</p>
            </ContentColumn>,
        );
        const col = container.querySelector('.content-column');
        expect(col).toHaveClass('content-column');
        expect(col).toHaveClass('container-wizard');
    });
});
