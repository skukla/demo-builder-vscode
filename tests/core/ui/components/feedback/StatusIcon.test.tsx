import { render } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { StatusIcon, type StatusIconStatus } from '@/core/ui/components/feedback/StatusIcon';

const COLOURS: [StatusIconStatus, string][] = [
    ['warning', 'text-notice'],
    ['error', 'text-negative'],
    ['success', 'text-positive'],
    ['info', 'text-informative'],
];

it.each(COLOURS)('%s is drawn in %s', (status, colour) => {
    const { container } = render(<StatusIcon status={status} />);

    expect(container.querySelector('svg')).toHaveClass(colour);
});
