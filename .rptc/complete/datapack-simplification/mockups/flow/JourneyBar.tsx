/**
 * The bar across the top of the prototype: every journey, the chosen journey's steps, and its
 * guided tour. Owner, 2026-11-11: "It should be easier to navigate to the journeys." The step menu
 * in the folded panel was the only way in. A step's id is also the page's hash (#J2-1), so a link
 * opens that step. Drawn in the prototype's own style so it never reads as part of the product.
 */

import React from 'react';
import { JOURNEYS, type BuiltStep, type ReviewJourney } from './reviewSteps';

const isBuilt = (journey: ReviewJourney): boolean => journey.steps.some((s) => s.window !== undefined);

/** The journey's first built step, where its button goes. */
const firstBuilt = (journey: ReviewJourney): BuiltStep | undefined =>
    journey.steps.find((s): s is BuiltStep => s.window !== undefined);

export interface JourneyBarProps {
    step: BuiltStep;
    onStep: (step: BuiltStep) => void;
    /** Journeys with a guided tour. */
    tours: readonly string[];
    onTour: (journey: string) => void;
}

function JourneyTabs({ current, onStep }: { current: string; onStep: (step: BuiltStep) => void }) {
    return (
        <div className="journey-tabs">
            {JOURNEYS.map((journey) => {
                const first = firstBuilt(journey);
                const label = `${journey.id} ${journey.name}`;
                return (
                    <button
                        key={journey.id}
                        type="button"
                        className={journey.id === current ? 'journey-tab journey-tab--on' : 'journey-tab'}
                        disabled={!first}
                        title={isBuilt(journey) ? label : `${label} (to build)`}
                        onClick={() => first && onStep(first)}
                    >
                        {journey.id}
                    </button>
                );
            })}
        </div>
    );
}

export function JourneyBar({ step, onStep, tours, onTour }: JourneyBarProps): React.ReactElement {
    const journey = JOURNEYS.find((j) => j.id === step.id.split('-')[0]) ?? JOURNEYS[0];
    const steps = journey.steps.filter((s): s is BuiltStep => s.window !== undefined);
    return (
        <nav className="journey-bar" data-react-aria-top-layer="true" aria-label="Journeys">
            <JourneyTabs current={journey.id} onStep={onStep} />
            <div className="journey-name">{`${journey.name}: ${step.title}`}</div>
            <div className="journey-steps">
                {steps.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={s.id === step.id ? 'journey-step journey-step--on' : 'journey-step'}
                        title={s.title}
                        onClick={() => onStep(s)}
                    >
                        {s.id}
                    </button>
                ))}
            </div>
            {tours.includes(journey.id) ? (
                <button type="button" className="tour-start" onClick={() => onTour(journey.id)}>
                    {`Start the ${journey.id} Guided Tour`}
                </button>
            ) : null}
        </nav>
    );
}
