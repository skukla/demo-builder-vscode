/**
 * The prototype panel's step switcher, for every journey: moved out of j1-windows.tsx when J2 was
 * added, so neither file passes 500 lines.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { JOURNEYS, STEPS, type BuiltStep } from './reviewSteps';
import { checkSteps, resultLine, type CheckResult } from './selfCheck';

/**
 * The panel's step switcher: every journey's steps in walk order, the chosen step's action and its
 * one question, and Previous / Next. Choosing a step opens its window as the step needs it.
 */
export function StepGuide({ step, onStep }: { step: BuiltStep; onStep: (s: BuiltStep) => void }) {
    const [checking, setChecking] = useState(false);
    const [results, setResults] = useState<CheckResult[]>([]);
    const host = document.getElementById('j1-steps');
    if (!host) return null;
    const runCheck = async (): Promise<void> => {
        setChecking(true);
        setResults([]);
        const found = await checkSteps(STEPS, onStep, { readMs: window.__J1__.readMs(), checkMs: window.__J1__.checkMs() });
        setResults(found);
        setChecking(false);
    };
    const at = STEPS.findIndex((s) => s.id === step.id);
    const go = (id: string): void => {
        const next = STEPS.find((s) => s.id === id);
        if (next) onStep(next);
    };
    return createPortal(
        <div className="step-guide">
            <label>
                Step
                <select value={step.id} onChange={(e) => go(e.target.value)}>
                    {JOURNEYS.map((j) => (
                        <optgroup key={j.id} label={`${j.id} ${j.name}${j.steps.some((s) => s.window) ? '' : ' (to build)'}`}>
                            {j.steps.map((s) => (
                                <option key={s.id} value={s.id} disabled={!s.window}>{`${s.id} ${s.title}`}</option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </label>
            <div className="step-do">{step.action}</div>
            <div className="step-q">{step.question}</div>
            <div className="step-nav">
                <button type="button" disabled={at <= 0} onClick={() => go(STEPS[at - 1]?.id ?? '')}>Previous</button>
                <button type="button" onClick={() => onStep(step)}>Reset Step</button>
                <button type="button" disabled={at >= STEPS.length - 1} onClick={() => go(STEPS[at + 1]?.id ?? '')}>Next</button>
            </div>
            <button type="button" className="step-check" disabled={checking} onClick={() => void runCheck()}>
                {checking ? 'Checking every step…' : 'Check All Steps'}
            </button>
            {results.length > 0 && (
                <div className="step-results">
                    {results.map((r) => (
                        <div key={r.id} className={r.ok ? 'step-result' : 'step-result step-result--bad'}>{resultLine(r)}</div>
                    ))}
                </div>
            )}
        </div>,
        host,
    );
}
