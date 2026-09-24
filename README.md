# TyposquatWatch

A pre-install dependency supply-chain guard for npm and Python projects. It scans your
`package.json`, `requirements.txt`, or `pyproject.toml` and flags dependencies that look
like **typosquats** — or **"slopsquats"**, packages an AI coding agent hallucinated and an
attacker pre-registered — of popular, real packages, before you `npm install` or `pip
install` them.

```
$ typosquatwatch scan

TyposquatWatch scan — ./package.json (npm, 8 dependencies checked)

3 package(s) flagged for review: 2 high, 1 medium, 0 low

 HIGH RISK  expresss@^4.18.0 (dependencies, score 0.73)
  looks like express (88% similar, edit distance 1)
  - name is 88% similar to popular package "express" (edit distance 1: 1 character inserted or removed)
  - first published 3691 day(s) ago
  - 535 downloads last week
  - 1 version(s) published

 HIGH RISK  chalkk@^5.0.0 (dependencies, score 0.73)
  looks like chalk (83% similar, edit distance 1)
  - name is 83% similar to popular package "chalk" (edit distance 1: 1 character inserted or removed)
  - first published 2618 day(s) ago
  - only 4 download(s) last week (near-zero adoption)
  - 1 version(s) published

 MEDIUM RISK  loadash@^1.0.0 (dependencies, score 0.43)
  looks like lodash (86% similar, edit distance 1)
  - name is 86% similar to popular package "lodash" (edit distance 1: 1 character inserted or removed)
  - first published 3653 day(s) ago
  - 24559 downloads last week
  - 2 version(s) published
```

(This is real output from a real scan against the live npm registry — see [Example
output](#example-output) below for exactly how it was produced.)

## Why this exists

Two related, actively-exploited attacks against the npm/PyPI supply chain:

1. **Typosquatting.** Attackers register package names one keystroke away from popular
   packages (`expresss`, `reqeusts`, `loadash`) and hope a human fat-fingers an install
   command.
2. **Slopsquatting.** AI coding agents frequently *hallucinate* plausible-but-nonexistent
   package names in generated code (`eslint-plgin-react`, a helper library that "should"
   exist but doesn't). Attackers monitor for these hallucination patterns and pre-register
   the names, so that the next agent (or human copying its output) that blindly runs
   `npm install <hallucinated-name>` pulls down attacker-controlled code instead of failing.
   Academic and industry research through 2025 has repeatedly shown LLMs hallucinate
   package names at a meaningful rate, and real squatted packages matching common
   hallucinations have been found live on npm and PyPI.

TyposquatWatch is a screening tool you run **before** installing: point it at your
manifest, and it tells you which dependencies are suspiciously close to a name you
probably meant, and whether the real registry evidence (age, versions, downloads) makes
that suspicion stronger or weaker.

## How it works

1. **Similarity check.** Every dependency name in your manifest is compared against a seed
   list of well-known, popular package names using **Damerau-Levenshtein edit distance**
   (insertions, deletions, substitutions, and adjacent-character transpositions all count
   as single edits — transpositions matter because swapped-letter typos like `lodahs` are
   one of the most common typo patterns). A dependency that is *not itself* in the popular
   list but sits within edit distance 1–2 of a popular name (and clears a normalized
   similarity threshold, to avoid noise on very short names) is flagged as a candidate.
2. **Real registry evidence.** For every flagged candidate, TyposquatWatch makes live HTTP
   calls to:
   - `https://registry.npmjs.org/<name>` — first-publish date and version count, or
     `https://pypi.org/pypi/<name>/json` for Python packages.
   - `https://api.npmjs.org/downloads/point/last-week/<name>` — weekly download count, or
     `https://pypistats.org/api/packages/<name>/recent` for Python packages.
3. **Scoring.** A candidate that is similar-looking **and** newly published **and** has
   near-zero downloads scores high. A similar-looking package that turns out to be
   long-established with real download volume (a legitimate, if confusingly-named,
   package) scores low — the download/age evidence exists specifically to suppress that
   false positive. A name that doesn't exist on the registry at all scores moderately: it
   isn't exploitable *yet*, but it's exactly the shape of hallucinated name an attacker
   would want to squat next.
4. **No match, no network call.** Dependencies that exactly match the popular-package seed
   list (the overwhelming majority in any real project) are skipped entirely — no
   similarity scoring, no network call. Unrelated, unpopular-but-legitimate internal
   package names are left alone too, as long as they aren't a near-miss of something
   popular.

## Install / quick start

Requires Node.js 18+.

```bash
git clone <this-repo>
cd typosquatwatch
npm install
npm run build
npm link   # makes the `typosquatwatch` command available globally, optional
```

Then, from any project:

```bash
typosquatwatch scan                      # scans ./package.json (or requirements.txt / pyproject.toml)
typosquatwatch scan ./path/to/project     # scans a specific directory
typosquatwatch scan ./requirements.txt    # scans a specific manifest file directly
typosquatwatch scan --offline             # no network calls, similarity heuristics only
typosquatwatch scan --json                # machine-readable output for CI
typosquatwatch scan --fail-on medium      # exit non-zero on medium-or-higher findings too
```

Without `npm link`, run it directly: `node dist/cli.js scan`.

Exit code is `0` if nothing at-or-above the `--fail-on` threshold (default: `high`) was
found, `1` if something was, and `2` on a usage/manifest error — suitable for wiring into a
pre-install CI check or a pre-commit hook.

## Example output

The block at the top of this README is real, unedited output from running:

```bash
node dist/cli.js scan test/fixtures/typosquat-package.json
```

against a fixture `package.json` containing `expresss`, `chalkk`, and `loadash` alongside
real dependencies (`react`, `lodash`, `d3-array`, `vitest`, ...). All three flagged names
turned out to be real, registered npm packages with genuinely low or moderate adoption —
exactly the "similar name, suspicious evidence" profile this tool is built to surface. The
real dependencies were correctly left unflagged.

## `--offline` mode

`--offline` skips every network call and scores purely on name similarity. Use it when you
have no connectivity, or in a sandboxed CI job that blocks egress. **It has meaningfully
more false positives than the default online mode**, because it cannot check whether a
similar-looking name is actually a long-established, high-download package (which online
mode correctly downgrades to low/medium risk) — offline, every close-edit-distance name
gets flagged at the same severity as a brand-new zero-download package.

## Limitations (read before you trust this in CI)

- **This is a screening aid, not a guarantee.** It has both false positives (legitimate
  packages with names that happen to resemble popular ones — `expresss` above is a real,
  if obscure, package) and false negatives (a well-crafted slopsquat with an unrelated but
  plausible-sounding name won't be caught by edit-distance matching at all).
- **The popular-package seed list is not a live top-5000-by-downloads feed.** npm's public
  API has no "list the top N packages by download count" endpoint (only per-package
  lookups), so `data/popular-npm-packages.json` (1,236 names) is a merge of (a) a real,
  published "top 1000 most depended-upon npm packages" snapshot from August 2019
  (community-maintained, via the `anvaka/npm-rank` gist) and (b) manual curation to cover
  well-known packages that postdate that snapshot (`vite`, `zod`, `pnpm`, `@tanstack/*`,
  etc.). It is honest, useful, and reasonably broad — but it is a curated seed list, not an
  exhaustive or continuously-refreshed ranking, and it will miss typosquats of legitimate
  packages that simply aren't on it. `data/popular-pypi-packages.json` (172 names) is
  entirely manually curated. Both files can be regenerated/extended via
  `scripts/generate-seed-lists.mjs`.
- **A package "not existing on the registry" is treated as moderate, not zero, risk.**
  That's deliberate: a hallucinated name that doesn't exist yet is not currently
  exploitable, but it's precisely the shape of name an attacker would pre-register next.
  Don't read "found: false" as "safe forever."
- **Rate limits and transient network failures degrade gracefully but silently-ish.** If a
  registry call fails (timeout, rate limit, DNS), the finding is still reported using
  similarity alone, with the error noted in its evidence — it does not crash the scan, but
  it also can't give you the download/age signal that would normally raise or lower
  confidence.
- **Python support is a lighter-weight stretch feature**, added after the npm path was
  solid. `requirements.txt` parsing handles plain `name==version` / `name>=a,<b` /
  extras-bracket lines and skips `-r`/`-e`/VCS/URL lines; `pyproject.toml` parsing covers
  PEP 621 `[project.dependencies]` and Poetry's `[tool.poetry.dependencies]` /
  `[tool.poetry.group.*.dependencies]`, but not every possible dependency-management tool's
  layout (e.g. PDM/Hatch-specific extensions beyond standard PEP 621 are not special-cased).
  Its automated test coverage is unit-level only (no PyPI integration test suite as broad
  as the npm one).
- **Monorepo workspace references, `file:`/`link:` local paths, and git-URL dependencies**
  are parsed as plain names where possible but are not specially validated — a `file:` or
  git dependency is inherently not a registry typosquat risk in the way a bare version
  range is.
- **Scoring thresholds and weights are heuristic**, tuned by hand against a handful of
  real examples during development, not against a labeled dataset of confirmed
  typosquats/slopsquats. Treat the HIGH/MEDIUM/LOW buckets as relative risk signals to
  triage, not a certified verdict.

## Development

```bash
npm install
npm run build        # compile TypeScript -> dist/
npm run typecheck    # tsc --noEmit
npm test             # full suite, including tests that hit the real npm/PyPI registries
npm run test:unit    # same suite minus *.integration.test.ts (safe to run fully offline... except it will just fail those tests as skipped-by-exclusion, not run them)
```

- `test/similarity.test.ts` and `test/scanner.test.ts` are pure unit tests (no network).
- `test/manifest.test.ts` and `test/scan.test.ts` exercise manifest parsing and the offline
  scan pipeline against fixtures (no network).
- `test/registry.integration.test.ts` makes real calls to registry.npmjs.org,
  api.npmjs.org, and pypi.org, and asserts zero false positives on `react`, `lodash`, and
  `express`. It's named `*.integration.test.ts` specifically so it can be excluded in
  network-restricted CI via `npm run test:unit`.

## License

MIT — see [LICENSE](./LICENSE).
