# Prompt

ultrathink

/rptc:research I notice that every time we hit the authentication wizard step, we see:\

Sign in to Adobe
Connect your Adobe account to create and deploy App Builder applications. You'll be redirected to sign in through your browser.

even if we still have an active token.  This isn't a bad experience, but I'm wondering whether we should simply move forward through the authentication flow if the user
has a valid, active token that has the proper permissions and only show this UX if the token needs to be regenerated via a browser login.
