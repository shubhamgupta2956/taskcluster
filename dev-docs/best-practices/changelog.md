# Changlog Entries

Any pull request to Taskcluster that has any user-visible effect should contain a new snippet in the `changelog/` directory.
This directory contains "snippets" that will be combined into the Changelog of the next release.

## File Format

Filenames should end in `.md` but are otherwise arbitrary.
To avoid conflicts, it's generally easiest to use a bug or issue identifier, e.g., `1849342.md`.

Each file is a markdown file with the following format:

```
# (required) the semver level of this change, one of 'patch', 'minor', or 'major'
level: ..
# (optional) a reference to the bug or issue tracking this change ("bug xxxxxxx" or "issue xxx")
reference:  ...
---
<Snippet Text>
```

## Levels

Every changelog snippet must specify a level.
These follow [semver](https://semver.org/):

A major change is one that breaks backward compatibility or could cause disruption for users if not handled carefully.
Do not be afraid to flag a change as major -- users and operations staff will always prefer to be warned of an issue that does not apply to them, over being surprised by an issue that the developers did not anticipate.

A minor change is one that adds new functionality without breaking backward compatibility.
Typically this functionality is something that would motivate a user or operator to adopt the upgrade.
If the change is in response to a feature-request filed by a user, it is probably at least "minor".

A patch change is one that fixes a bug or makes a trivial change on which users would not rely.
A key distinction between minor and patch changes is that an operations engineer should be comfortable rolling back a patch upgrade immediately if any issues are uncovered.
If a change cannot be easily rolled back, it is not a patch change.

## Snippet Text

In writing a changelog snippet, think of the perspective of the Taskcluster user who will be reading it.
They will want to know "what does this mean for me?"
Write it in the present tense, as if the change had just been deployed.

For example:

> Worker pools are now deleted by updating their `providerId` to `null-provider`.
> The `deleteWorkerPool` API method is no longer supported.

If a change fixes a bug, describe the circumstances where that bug would occur as completely as possible, and when the bug was introduced.
Users may want to determine whether the bug they are seeing is novel or will be fixed with this update:

> This release fixes a bug where a hook with an invalid pulse binding would cause bindings for all hooks to be reset repeatedly, potentially leading to delays triggering those hooks.
> This incorrect behavior was visible in the Hooks service's logs, but not visible to users.
> The bug was introduced in v11.4.0.

If the change is not user-visible, but would be important to someone deploying Taskcluster, write it for that audience:

> The web-server service now takes a single `JWT_KEY` configuration value
> containing an HMAC-SHA256 secret, replacing the earlier use of a
> public/private key pair.

If nobody could possibly care about the change, then it may be OK to omit the changelog snippet entirely.
This is the case for

* typo fixes
* minor documentation edits,
* test-only changes
* changes to developer infrastructure such as `yarn generate` or `yarn lint`

In this case, include a sentence in your PR justifying the lack of a changelog snippet.
