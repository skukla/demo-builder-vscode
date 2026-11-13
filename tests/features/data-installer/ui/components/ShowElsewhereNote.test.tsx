/**
 * ShowElsewhereNote: the filter's note when its matches sit under another Show choice (Clarity 1.13,
 * step-04 S10). Its button labels are written out (so the Title Case scan reads them), and each must
 * stay "Show" and the choice's own name in the Show list.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { showOptions } from '@/features/data-installer/ui/catalogShow';
import { ShowElsewhereNote } from '@/features/data-installer/ui/components/ShowElsewhereNote';

describe('ShowElsewhereNote', () => {
    it.each(showOptions(true).map((option) => [option.key, option.label] as const))(
        'labels the way to %s with its Show name',
        (key, label) => {
            const onShow = jest.fn();
            const { unmount } = render(
                <ShowElsewhereNote
                    show="recommended"
                    elsewhere={{ show: key, count: 2 }}
                    onShow={onShow}
                />
            );

            screen.getByRole('button', { name: `Show ${label}` }).click();

            expect(onShow).toHaveBeenCalledWith(key);
            unmount();
        }
    );
});
