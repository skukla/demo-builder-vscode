/**
 * What was decided at the step on screen, beside its window: the end state in a few short lines
 * (`ReviewStep.decided`), what the step leaves for the build phase, and, behind a toggle, the full
 * history of verdicts in the owner's words. Clicking through the steps with the panel's Previous and
 * Next is the journey's review (owner, 2026-11-11: "a click-through journey that encapsulates all of
 * the decisions made", not a page of screenshots). Drawn in the prototype's own style (dashed,
 * monospace, amber) so it never reads as part of the product.
 */

import React, { useState } from 'react';
import { DECISIONS } from './reviewDecisions';
import type { BuiltStep } from './reviewSteps';

export function DecisionsPanel({ step }: { step: BuiltStep }): React.ReactElement {
    const [hidden, setHidden] = useState(false);
    const [history, setHistory] = useState(false);
    const logged = DECISIONS[step.id] ?? { verdicts: [], build: [] };
    const decided = step.decided ?? [];
    return (
        <aside className={hidden ? 'decisions decisions--hidden' : 'decisions'} data-react-aria-top-layer="true" aria-label={`Decisions at ${step.id}`}>
            <div className="decisions-head">
                <span>{`${step.id} ${step.title}`}</span>
                <button type="button" onClick={() => setHidden(!hidden)}>{hidden ? 'Show' : 'Hide'}</button>
            </div>
            {hidden ? null : (
                <div className="decisions-body">
                    <div className="decisions-sub">Decided</div>
                    {decided.length ? (
                        <ul className="decisions-list">
                            {decided.map((d) => (
                                <li key={d}>{d}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="decisions-none">Nothing decided yet.</p>
                    )}
                    {logged.build.length > 0 ? (
                        <>
                            <div className="decisions-sub">Left for the build phase</div>
                            <ul className="decisions-build">
                                {logged.build.map((b) => (
                                    <li key={b}>{b}</li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                    {logged.verdicts.length > 0 ? (
                        <button type="button" className="decisions-toggle" onClick={() => setHistory(!history)}>
                            {history ? 'Hide History' : `Show History (${logged.verdicts.length} verdict${logged.verdicts.length === 1 ? '' : 's'})`}
                        </button>
                    ) : null}
                    {history
                        ? logged.verdicts.map((v, i) => (
                              <div className="decision" key={`${v.topic}-${i}`}>
                                  {v.topic ? <div className="decision-topic">{v.topic}</div> : null}
                                  <div className="decision-verdict">{v.verdict}</div>
                                  <div className="decision-words">{v.words}</div>
                              </div>
                          ))
                        : null}
                </div>
            )}
        </aside>
    );
}
