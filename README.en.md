# AI Style Detector · dsh-style-detector

A right-sidebar tab plugin for DSH (DeepSeek Harness). Paste some Chinese text and get a 0–100 "AI-flavor" score with per-dimension diagnosis, highlighted problem spans, per-item rewrite suggestions, and one-click replacement.

**What this is, precisely**: a **mechanical-risk detector for prose**, not an AI-text classifier. It checks whether Chinese text reads like it was mass-produced by a machine, using explainable local rules. A low score only means the text avoids the dozen patterns below — **it does not mean the writing is good, and it does not mean a publishing platform will accept it.**

- Scoring and span location are **fully local** — no network, no API key, same text always gives the same score
- Semantic review goes to the model already bound in DSH (swappable, affects this panel only); its findings merge into the same analysis, and the score is still computed locally
- Two genres: **General** (expository / argumentative / official) and **Web-fiction** (narrative / dialogue / scene) — different word lists, weights and review prompts
- Eight tabs: Diagnose / Mark / Suggest / Typos / History / Priority / Compare / Batch

## Install

### Desktop app (GUI)

1. Open **Settings → Plugins**
2. Search the market for `dsh-style-detector`, or install by package name
3. **Fully quit DSH and reopen it** (not just closing the window, not a page reload)
4. Open the right sidebar's "+" guide page and pick "AI 文风检测" (AI style detector)

### From npm (recommended)

```bash
dsh plugin add dsh-style-detector
# then quit DSH completely and reopen it
```

Package page: https://www.npmjs.com/package/dsh-style-detector

### Straight from GitHub (no npm needed)

```bash
dsh plugin add https://github.com/grq6414-hash/dsh-style-detector/releases/download/v0.1.0/dsh-style-detector-0.1.0.tgz
# then fully quit DSH and reopen it
```

You can also grab the `.tgz` by hand from the [Releases page](https://github.com/grq6414-hash/dsh-style-detector/releases).

### Manual

```bash
cd ~/.dsh/profiles/<your profile>
pnpm add https://github.com/grq6414-hash/dsh-style-detector/releases/download/v0.1.0/dsh-style-detector-0.1.0.tgz
# then add "dsh-style-detector" to the dsh.profile.bundles array in package.json
```

> Once this package is published to npm, `pnpm add dsh-style-detector` works too.

> **Why a full restart is required**: the plugin manifest (`dsh.profile.bundles`) and the frontend boot graph (`window.__DSH_BOOT__`) are generated together at process start. Enabling or disabling a plugin at runtime and then reloading the page can leave the boot graph without that plugin's factory — the tab entry sticks in `loading` and the whole Web UI goes blank (DSH has no safe mode yet, so you have to kill the process). **Change plugin state → quit fully → reopen.**

> **Do not install this next to the local development copy.** If you previously linked the dev version from `created-plugins`, uninstall it first: both register the same tab kind and the same `/dsh-style-detector/*` routes, and the later one silently loses.

## What it does

### Diagnose

Total-score ring plus seven dimension cards. Every dimension is an "AI-flavor" score: **higher means more AI-like**, 0 = reads human, 100 = obviously synthetic.

| Dimension | General | Web-fiction | What it measures |
| --- | --- | --- | --- |
| AI clichés | 0.24 | 0.20 | ~54 template phrases (general) / ~51 fiction clichés (web-fiction), by density |
| Sentence uniformity | 0.20 | 0.22 | Sentence-length dispersion + paragraph-length dispersion + share of near-average sentences |
| Parallel structure | 0.14 | 0.10 | Consecutive sentences within 3 characters of each other (3 = light penalty, 4+ = heavy) + thesis-body-thesis shape |
| Connective density | 0.14 | 0.10 | Written logical connectives + clustered em dashes + semicolon-chained clauses |
| Lacks concrete detail | 0.16 | 0.20 | Numbers, proper nouns, quoted content, time words (general); dialogue, senses, action, objects, body parts (web-fiction) |
| Lexical repetition | 0.12 | 0.18 | Bigram type-token ratio with terminology removed; plus a paraphrase-repetition check |
| Semantic layer | 0.18 | 0.18 | Model review (picks spans, does not score); total = local six × 0.82 + semantic × 0.18 |

Bands: ≥66 "heavy AI flavor", 36–65 "half human, half machine", <36 "reads human".

The Diagnose tab also has two clickable charts: **sentence rhythm** (one bar per sentence or group) and **paragraph heat** (one cell per paragraph, darker = heavier). Click either to jump to the Mark tab with those sentences highlighted and scrolled into view.

Dimension cards are clickable too: any card with an "N places" badge jumps straight to those problems and cycles through them on repeat clicks.

### Mark

The text is colour-coded by problem type. The legend always lists all seven categories and each chip cycles through its hits (showing `2/5` progress). Sentence-level issues (vague imagery, all-long-sentences, paraphrase repetition) get a dashed underline; word-level issues get a solid one, so you can tell them apart at a glance.

Body text has four size steps (A− / A+), remembered across sessions.

### Suggest

One card per problem with an **original / rewritten** two-line comparison: the matched span is struck through in red, and the rewrite sits below it. Items with no automatic rewrite say "suggestion only, no auto-rewrite".

Each card has three actions: **apply** (that one place only), **ignore** (stop scoring it; the fingerprint is remembered), and the original line is clickable (jumps back to the Mark tab at that sentence).

Sentence-level items like "lacks imagery" deliberately have no automatic rewrite — the tool cannot know what picture you meant to draw, and a fake rewrite would only make it worse.

### Typos

A separate tab that **does not affect the style score at all** (spelling is a correctness issue; mixing it into an AI-flavor score makes both unreliable).

Two layers:

1. **Built-in confusion table** (231 pairs such as 既使→即使, 做为→作为, 烦燥→烦躁, 签定→签订) — instant, offline, zero latency
2. **Model scan** (only when you press the button) — picks up lookalike characters, misused idioms and homophones. Every hit must be found verbatim in the original text and the wrong characters must be a substring of it; anything that fails is dropped

Proper nouns are protected: anything inside 《》 is never reported, and quoted strings appearing twice or more are treated as names. "Not a typo" adds the word to a whitelist shared with the style word list.

### History

The last 30 checks (text + score + time), one click to load back.

### Priority

"The 10 sentences to fix first": problems are grouped by sentence, then the engine **actually re-runs on each candidate rewrite** to measure how many points that one sentence is really worth. Sorted by real drop. It is a priority list, not a new dimension.

### Compare

Paste v1 and v2: score delta, how many issues were fixed, how many were introduced, how many remain.

### Batch

Drop or pick a `.txt`, auto-split on "第 N 章" headings, and get a per-chapter table (length, score, three heaviest dimensions). A trend strip on top shows the average, first-to-last change, cleanest/heaviest chapter and one bar per chapter.

Table rows are clickable: load that chapter into the editor and jump to Diagnose.

## Ten small conveniences

1. **Ctrl/⌘ + Enter** — review immediately (skip the auto delay)
2. **Ctrl/⌘ + Z** — undo the last "replace all" or typo fix (one step)
3. **Esc** — close the zoom editor or the options panel
4. **Zoom** — expand the editor to full screen
5. **Target score** — set one (default 30, presets 25/30/36); the ring turns green when met
6. **Custom word lists** — add your own tics to the deny list, kill false positives with the allow list
7. **Excluded dimensions** — turn off a dimension you do not care about; remaining weights renormalise
8. **Copy report** — export a Markdown report (score, dimension table, top sentences)
9. **Config backup** — export/import genre, target, font size, word lists, ignore list
10. **Swap review model** — click the model name under the title to pick from your bound providers

## Known limits (please read)

**Cannot be fixed**:

- **Word lists always under-report.** A low score proves the text avoids these dozen patterns, nothing more
- **Narrative, character and plot clichés are invisible.** A beat-for-beat trope, an unresolved setup, every character sounding identical — this is the biggest hole in local rules, and also what platforms most easily catch
- **Model review is non-deterministic.** The same model can differ between runs, and different models differ more. Two safeguards are in place ("can only subtract points, never add" and verbatim-quote validation), but it remains one model's opinion
- **Passing this ≠ passing a platform.** Platforms may use perplexity/burstiness classifiers, watermarks, human review, reader reports or update-behaviour features. This tool measures prose style only

**Fixable but not yet fixed**:

- The English UI is partial (`locale/en.json` has only title and description; panel strings are Chinese)
- Terminology detection is bigram-based rather than true word segmentation, so extremely technical text can still read as slightly harsh

**Suggested usage**: treat it as a pre-edit mechanical screening. Aim under 30, focusing on parallel structure, vague imagery and paraphrase repetition; stop chasing once you are under 25 (it starts hurting the prose); leave the rest to three human questions — does this chapter move the story? do the characters sound different from each other? does the ending make you want the next chapter?

## Data and privacy

Everything lives in local browser `localStorage`, all keys prefixed `dsh.style-detector.`:

| Key | Content |
| --- | --- |
| `draft.v1` | Current text being edited |
| `history.v1` | Last 30 checks |
| `mode.v1` | Genre (`general` / `fiction`) |
| `ignore.v1` | Ignored issue fingerprints and dimensions |
| `custom.v1` | Custom word lists (`{deny, allow}`) |
| `target.v1` | Target score (1–100, default 30) |
| `v2.v1` | Second version text on the Compare tab |
| `font.v1` | Mark tab font step (0–3, default 1) |
| `model.v1` | Chosen review model (`{provider, model}`; empty = follow default) |

**Only the local rule engine is offline.** Pressing "review" or "typo scan" sends the text to whichever provider you bound in DSH — your own configuration, your own explicit action. Turn off auto-review (the checkbox in the status bar) if you do not want that.

## Development

```bash
git clone https://github.com/grq6414-hash/dsh-style-detector.git
cd dsh-style-detector
# no build step — client.js is plain hand-written CJS, index.js is a host ESM plugin
```

The split:

- `index.js` — host side (Node). Registers `/dsh-style-detector/review` and `/dsh-style-detector/proofread`, calls `ctx.llm.stream`, and treats model output as **untrusted data** (a quote must be found verbatim in the source text before it is returned)
- `client.js` — browser side. Rule engine + eight views + tab registration/teardown. Entry point is `window.__ModuleLoader__.load({ id, factory })`

To tune the rules: the six scoring functions `dimCliche` / `dimUniform` / `dimParallel` / `dimConnective` / `dimDetail` / `dimDetailFiction` / `dimDiversity` in `client.js`; weights live in `MODES`. Changes take effect on hot reload (`dsh plugin disable/enable`) — no compile step.

## License

MIT
