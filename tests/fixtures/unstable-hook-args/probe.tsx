/**
 * CONTROL FIXTURE for tests/sop/stable-hook-arguments.test.ts. Every defect here
 * is DELIBERATE — this file exists to prove the detector can still see one.
 *
 * It lives under tests/ rather than src/ on purpose: the suite must not create and
 * delete a file inside a tree other suites are walking at the same time.
 */
import { useEffect, useMemo, useState } from 'react';

/** Depends on its whole parameter inside an effect that SETS STATE — a loop. */
export function useLoopingProbe(opts: { items: string[] }): void {
    const [, setN] = useState(0);
    useEffect(() => {
        setN((n) => n + 1);
    }, [opts.items]);
}

/** Re-subscribes every render but settles — churn, not a loop. */
export function useChurningProbe(opts: { cb: () => void }): void {
    useEffect(() => {
        document.addEventListener('probe', opts.cb);
        return () => document.removeEventListener('probe', opts.cb);
    }, [opts.cb]);
}

/** A defeated memo: recomputes every render, harms nothing else. */
export function useMemoProbe(opts: { fields: string[] }): number {
    return useMemo(() => opts.fields.length, [opts.fields]);
}

/** MUST NOT be flagged: destructured, so the object is never depended upon. */
export function useDestructuredProbe({ label }: { label: string }): string {
    return useMemo(() => label.toUpperCase(), [label]);
}

/** MUST NOT be flagged: a SPREAD depends on the elements, not the array. */
export function useSpreadProbe(conditions: unknown[], set: (v: boolean) => void): void {
    useEffect(() => {
        set(conditions.every(Boolean));
    }, [...conditions, set]);
}

const STABLE_SET = (_v: boolean): void => undefined;

export function Probe(): null {
    useLoopingProbe({ items: [] });
    useChurningProbe({ cb: () => undefined });
    useMemoProbe({ fields: [] });
    useDestructuredProbe({ label: 'x' });
    // Only the SPREAD is under test here, so the second argument is hoisted —
    // an inline arrow there is named directly in the deps and would be a real
    // finding, which would make this control prove the opposite of its point.
    useSpreadProbe([1, 2], STABLE_SET);
    // React's own hooks must stay excluded — all three of these are correct code.
    useState([]);
    useMemo(() => 1, []);
    useEffect(() => undefined, []);
    return null;
}
