# Security Policy

## Supported Versions

Only the latest release is supported for security fixes.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities.

Send reports to: `contact@tickward.com`

Please include:

- A description of the issue and impact
- Steps to reproduce or proof of concept
- Affected version or commit
- Any suggested mitigation

The maintainer will review accepted reports and publish fixes in a future
release.

## Keys And Share Links

The app uses the word "key" for a few different things. They are not
interchangeable.

Restore keys are bearer secrets for full project access. Anyone with a restore
key can restore, sync, overwrite, or delete that project's cloud copy. Treat a
restore-key leak like a password leak.

Project restore tokens are stored in PostgreSQL as hashes, not raw restore keys.
Database rows, logs, backups, and observability output should still be protected:
if project access data leaks, treat it as sensitive.

When a signed-in user claims an anonymous project, the old restore-key access
token is marked revoked and the project moves to account-scoped project access.
Do not rely on restore keys as a long-term identity boundary for account-owned
projects.

Expired or revoked restore-key tokens must not restore, save, clear, or claim
project data. Claiming consumes the token atomically before changing project
ownership.

Share links are separate unlisted read-only links for individual timers. They do
not store the owner's restore key and do not grant full project access. Timer
share links resolve against the current saved timer data, so deleting the timer
or project also removes the public share content. The restore key or account
project access is checked when creating a share link, but it is not written into
the share record.
