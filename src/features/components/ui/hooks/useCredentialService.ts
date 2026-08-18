/**
 * Does this user need to type Commerce credentials at all?
 *
 * The two ACCS OAuth fields are an OVERRIDE, not a requirement — when the shared
 * discovery service serves a credential, the import fetches one at use time and
 * nothing needs to be entered. The fields never said so, so an empty box read as a
 * missing setting and sent people to the Developer Console for a credential they
 * already had.
 *
 * Asks once per org and caches the answer for the panel's lifetime: the verdict
 * changes when a setting or an allowlist changes, neither of which happens while a
 * wizard step is open, and the probe is a network round trip in front of a form.
 *
 * @module features/components/ui/hooks/useCredentialService
 */

import { useEffect, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/** Mirrors `CredentialServiceStatus` on the handler side. */
export interface CredentialServiceStatus {
    served: boolean;
    verdict: string;
    httpStatus?: number;
}

export interface CredentialServiceState {
    /** True while the probe is in flight — render the fields as they were. */
    loading: boolean;
    /** Undefined until the probe answers, or when it could not be asked. */
    status?: CredentialServiceStatus;
}

/**
 * Probe the shared credential service.
 *
 * @param enabled - false for backends that do not use this credential (PaaS), so
 *                  no request is made at all rather than made and ignored
 * @param orgId - the org whose service entry to select
 */
export function useCredentialService(enabled: boolean, orgId?: string): CredentialServiceState {
    const [state, setState] = useState<CredentialServiceState>({ loading: enabled });

    // Keyed by org so a sign-in that switches org re-asks, but a re-render does not.
    const askedFor = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!enabled) {
            setState({ loading: false });
            return;
        }
        const key = orgId ?? '(no-org)';
        if (askedFor.current === key) {
            return;
        }
        askedFor.current = key;

        let cancelled = false;
        setState({ loading: true });

        webviewClient
            .request<{ success?: boolean; data?: CredentialServiceStatus }>(
                'check-credential-service',
                orgId ? { orgId } : {},
            )
            .then((response) => {
                if (cancelled) return;
                // A probe that cannot answer leaves the fields exactly as they were.
                // "We could not check" must never render as "you must type these".
                setState({ loading: false, status: response?.data });
            })
            .catch(() => {
                if (!cancelled) setState({ loading: false });
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, orgId]);

    return state;
}
