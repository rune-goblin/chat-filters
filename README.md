# Chat Search

A Foundry VTT v14 module that lets the GM search and filter the chat log in place.

- **Search bar** at the top of the chat sidebar. Typing searches message text, flavor, speaker
  and roll formulas. All words must match; wrap a phrase in `"double quotes"` to match it
  exactly. <kbd>Esc</kbd> clears it; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> focuses it.
- **Autofill.** As you type, the bar suggests matching filters with their message counts, e.g.
  `spe` offers *Type: Spell*. <kbd>↑</kbd>/<kbd>↓</kbd> then <kbd>Enter</kbd> or <kbd>Tab</kbd>
  (or a click) turns it into a filter chip under the bar. `facet:value` narrows the list
  (`type:`, `check:recov`, `item:fire`). <kbd>Backspace</kbd> in an empty box removes the last chip.
- **Filters button** beside it opens a filters dialog: time range, player, speaker, visibility
  (public, whisper, blind) and type (roll, message, spell). Pick several values in one filter
  to match any of them; filters combine. The button shows how many filters are on.
- **Filtered log.** While a search or filter is active, the chat log shows only the matching
  messages, rendered as normal chat cards, newest at the bottom. "Show older matches" loads more.
  Right-click a message and choose **Show in full chat log** to clear the search and jump to it.
- **Live**: matches update as messages arrive, change or get deleted.

GM only.

## Systems

The search core works under any system. A system adapter adds filters built from the data
that system stores on its messages.

- **Pathfinder 2e** (`src/adapters/pf2e.ts`) adds **Spell** to Type (spell cards and any roll
  from a spell) plus roll type, degree of success, target, item or spell, damage type and
  trait filters, read from `flags.pf2e`.

To support another system, write a `SystemAdapter` that lists `FacetDef`s and register it in
`src/adapters/index.ts`. An adapter facet that reuses a core key adds values to that facet.

## Layout

```
src/index.ts                  hooks, keybinding, context-menu entry, public api
src/search/                   system-agnostic core
  types.ts                    MessageRecord, FacetDef, SystemAdapter, SearchQuery
  text.ts                     HTML → text, query terms
  filter.ts                   filterRecords, facetOptions (pure; unit-tested)
  records.ts                  ChatMessage → MessageRecord, core facets
  index.svelte.ts             live index kept in sync by chat-message hooks
  state.svelte.ts             shared query state and results
  suggest.ts                  autofill matching (pure; unit-tested)
src/adapters/                 per-system facets (pf2e.ts), mergeFacets
src/ui/inline.ts              mounts the bar and results panel into the chat sidebar
src/ui/SearchBar.svelte       search input, autofill, filter chips, filters button
src/ui/filtered-log.svelte.ts renders matching messages in place of the log
src/ui/FiltersApp.ts          ApplicationV2 shell for Filters.svelte
src/ui/reveal.ts              scroll the full log to a message
src/tests/unit/               vitest specs
```

## Develop

Set up once — needs Node ≥ 22.18 (for native `.ts` config/tooling) and a local Foundry install. The
[`fvtt`](https://github.com/foundryvtt/foundryvtt-cli) CLI (for packs) ships as a dev
dependency, so `npm install` brings it:

```bash
npm install
npm run setup      # scaffold this module into Foundry (see below)
npm run build      # emit dist/, then enable the module in a world
```

Then:

```bash
npm run dev        # HMR dev server (Vite reverse-proxies Foundry)
npm run watch      # vite build --watch (rebuild dist/ on save, no HMR)
npm run check      # svelte-check + tsc --noEmit
npm test           # vitest unit specs (zero-setup; the CI tier)
npm run test:e2e   # Playwright vs. a real headless Foundry (opt-in — see src/tests/e2e/README.md)
npm run deploy     # build + copy a clean, self-contained module into Foundry
```

**HMR** runs Vite on `:30001` as a reverse proxy *in front of* a running Foundry. Foundry
must already be running, and the esmodule loads only inside an **active world** — so
there's nothing to hot-swap until you launch one:

1. Start Foundry, then **Launch World** (Setup → a world with this module enabled). First
   time only: launch the world once on `:30000`, enable the module under *Manage Modules*,
   and reload — after that it stays on.
2. `npm run dev` (leave Foundry running).
3. Open **http://localhost:30001/game** — *not* `:30000` — and log in.

Now editing a `.svelte` component hot-swaps in place, keeping state. Editing
`src/index.ts` (hooks/bootstrap) triggers a full page reload instead — that's expected.

Prefer the plain bundle? `npm run watch` keeps the old flow: it rebuilds `dist/` on
save; browse `:30000` and reload the browser after a `.js`/`.svelte` rebuild (Foundry
hot-reloads `.hbs`/`.css`/`.json` in place, but not esmodules).

### `npm run setup`

Installs the module into Foundry for live dev and pulls reference sources in. It resolves
three things, prompting only when it can't detect them:

- **Foundry data dir** — from Foundry's `Config/options.json` (`dataPath`) in the
  default user-data folder (macOS `~/Library/Application Support/FoundryVTT*`, Windows
  `%LOCALAPPDATA%\FoundryVTT*`, Linux `~/.local/share/FoundryVTT*`); `FOUNDRY_DATA`
  overrides. It links an existing dir, never creates one.
- **Game system source** (optional — core types come from the `fvtt-types` dep) — pick an
  installed system from your Foundry data dir, point at a checkout, or skip.
- **Links** — confirms before writing them.

The Foundry module dir (`<FoundryData>/Data/modules/<id>`) is a **real directory** whose
entries symlink back to the repo — `module.json`, `dist/`, `lang/`, `packs/`, and `assets/`.
This keeps edits and Vite HMR live without exposing the whole repo (`node_modules`, `.git`)
to Foundry, and `assets/` resolves at the same `modules/<id>/assets/…` path content
references. For a clean, link-free copy (assets and packs included), use `npm run deploy`.

Resolved paths cache to `.dev-paths.json` (gitignored). Flags: `--reconfigure` (re-ask),
`--no-link` (paths only), `--yes` (non-interactive). The gitignored links it creates:

| In-repo link       | Points at                  |
|--------------------|----------------------------|
| `_system-source`   | the game system you build against |
| `_foundry-data`    | `<FoundryData>/Data`       |
| `_foundry-modules` | `<FoundryData>/Data/modules` |

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request. It guards
the lockfile (`scripts/check-lockfile.ts`), installs with `npm ci`, type-checks
(`npm run check` — svelte-check + tsc), and runs the vitest unit suite (`npm test`). No
secrets, no Foundry install — a module created from this template gets a **green CI bar the
moment its repo is on GitHub**, nothing to configure. (This is separate from `release.yml`,
below, which runs only on version tags.)

Picking it up as you build:

- **Keep it meaningful.** CI runs whatever `npm test` runs, so add vitest specs under
  `src/tests/unit/` as you add logic. An empty suite still passes — a green bar means
  "typechecks + whatever tests exist," not "tested."
- **e2e is intentionally excluded.** `npm run test:e2e` drives a real headless Foundry, which
  needs a licensed install and a migration-current world the runner doesn't have. Run it
  locally — see [`src/tests/e2e/README.md`](src/tests/e2e/README.md).
- **Want coverage reporting/gating?** Add a `test:coverage` script (and, for a step-summary,
  a `scripts/coverage-summary.ts`), then append the step to `ci.yml`. It's left out here so the
  workflow stays generic — CI shouldn't fail on a coverage threshold a fresh module can't meet.

## Release

This pipeline is for the module you generate, **not** for the template. People consume the
template through GitHub's **Use this template**, which copies `main` — so the template itself
is never installed into Foundry and needs no release of its own. (Don't cut a release just
because `main` moved; there's no consumer pulling it.)

Once `npm run init` has turned this into your module, push a tag `vX.Y.Z`: `release.yml` stamps
the version, type-checks, builds, and publishes a GitHub release with the installable
`module.json` + zip that Foundry pulls.

## License

This template's own code is [MIT](LICENSE) — use, modify, and build on it freely.

The MIT license covers **only the template**. It grants no rights to any game system's
intellectual property: rules text, names, and other publisher content are licensed
separately by whoever owns them.

If you ship a system's content, or copy code out of a system, comply with that system's
own license before redistributing.
