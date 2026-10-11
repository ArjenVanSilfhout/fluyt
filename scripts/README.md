# scripts

Local tooling for this repo; none of it ships in the plugin payload.

- `validate-local.ps1` - the dual-package local gate (CI is authoritative).
- `guard-matrix.js` - fixture matrix for the shipped guard hook.
- `publish-release.ps1` - the release publisher.
- `plugin-vocabulary-allowlist.txt`, `component-size-budget.txt` - data files the gate reads.
- `hooks/pre-push` - the opt-in denylist scan below.

## Denylist pre-push hook

`hooks/pre-push` rejects a push when the tree, a commit (author, committer, message) or an
annotated tag contains a term from a private list kept outside the repo. The terms are never
committed. It fails closed: a missing, unreadable or empty terms file blocks the push.

Set it up once per clone:

```sh
git config core.hooksPath scripts/hooks
mkdir -p ~/.config/denylist
printf '%s\n' 'example-term' 'another-term' > ~/.config/denylist/terms.txt
```

One term per line; blank lines and `#` comments are ignored; matching is case-insensitive.
Set `DENYLIST_FILE` to use a different path:

```sh
DENYLIST_FILE=/path/to/terms.txt sh scripts/hooks/pre-push --all
```

Run with `--all` (or from a terminal) to scan HEAD plus all reachable history and annotated tags
as a to-do list of what is left to scrub.
