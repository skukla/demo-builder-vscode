import React from 'react';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';

interface UserData {
    name: string;
    email: string;
    orgName?: string;
    orgId?: string;
}

interface AuthSuccessStateProps {
    userData: UserData;
}

export function AuthSuccessState({ userData }: AuthSuccessStateProps) {
    const details = [userData.name, userData.email];
    if (userData.orgName) {
        details.push(userData.orgName);
    }

    return (
        <StatusDisplay
            variant="success"
            title="Successfully Authenticated"
            details={details}
        />
    );
}
