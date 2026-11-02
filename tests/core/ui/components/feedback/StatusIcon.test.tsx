import { render } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { StatusIcon, type StatusIconStatus } from '@/core/ui/components/feedback/StatusIcon';

const COLOURS: [StatusIconStatus, string][] = [
    ['warning', 'text-orange-600'],
    ['error', 'text-negative'],
    ['success', 'text-green-600'],
    ['info', 'text-blue-600'],
];

it.each(COLOURS)('%s is drawn in %s', (status, colour) => {
    const { container } = render(<StatusIcon status={status} />);

    expect(container.querySelector('svg')).toHaveClass(colour);
});
