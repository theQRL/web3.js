## Guidelines for Pull Requests and Releases

_These guidelines are a work in progress and will be changed/updated as the project evolves._

This document provides some ground rules for contributors (including the maintainer(s) of
the project) about how to make, review and publish changes. The most basic requirement is
that **this should not break**.

### Pull Requests for substantive changes (e.g. everything except comments and docs)

1.  Any PR that introduces a logic change should include tests. (In many cases, the tests will take more time to write than the actual code).
1.  All PRs should sit for 72 hours with the `pleasereview` tag in order to garner feedback.
1.  No PR should be merged until it has been reviewed, passes CI, and all reviews' comments are
    addressed.
1.  PRs should:
    1.  have a narrow, well-defined focus.
    1.  make the smallest set of changes possible to achieve their goal.
    1.  include a clear description in the opening comment.
    1.  preserve the conventions and stylistic consistency of any files they modify.
1.  Given the choice between a conservative change that mostly works and an adventurous change which seems better but introduces uncertainty - prefer the conservative change.

### Reviews

The end goal of review is to suggest useful improvements to the author. Reviews should finish with approval unless there are issues that would result in:

1.  Buggy behaviour.
1.  Undue maintenance burden.
1.  Pessimisation (i.e. speed reduction / meaningful build-size increases).
1.  Feature reduction (i.e. it removes some aspect of functionality that users rely on).
1.  Avoidable risk (i.e it's difficult to test or hard to anticipate the implications of, without
    being strictly necessary to fix something broken).

Read more in [Review Guidelines](./REVIEW.md).

### Releases

Releases are produced by GitHub Actions from `main`, not proposed in a pull request:

1.  Every pull request merged to `main` is a release candidate. Its Conventional Commit types decide
    whether a package is released and how its version is bumped (`fix:`/`perf:` patch, `feat:` minor,
    `feat!:`/`BREAKING CHANGE:` major); commits without a release type publish nothing.
1.  The review that gates a release is the pull-request review (CODEOWNERS approval, the required
    status checks including package inspection and the tarball smoke tests) plus the approval of the
    protected `npm-publish` environment, which a release maintainer grants per run after the
    candidate tarballs have passed the smoke test on the advertised Node floor.
1.  There are no `rc` versions: what is approved is the exact tarball that gets published, and the
    GitHub release, attestations and provenance describe those bytes.
1.  Testing against a Node project and the published browser bundle happens on the pull request
    (the black-box test projects under `packages/web3/test/*_black_box` are the manual aid for
    that) and in the post-release verification steps of the release guidelines.

The previous process — a release PR with a one-week community review and published `rc` versions —
predates the automated pipeline and no longer applies.

Read more in [Release Guidelines](./RELEASE.md).

### Emergencies

Emergency releases are allowed to shorten waiting periods depending on the severity of the issue.
