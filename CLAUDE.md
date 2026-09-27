# chat-filters — project rules

A Foundry VTT v14 module that lets GMs and players search and filter the chat log. A scripted esmodule
(`src/`) built with TypeScript + Svelte 5 + Vite (`src/index.ts` → `dist/chat-filters.{js,css}`);
it registers no packs. `module.json` is the manifest. Architecture: README "Layout".

**The Foundry API, compendium packs, Svelte-in-ApplicationV2, the Vite build, and
multi-client sync live in the project's `foundry-module` skill** — consult it for any of
those (it loads on demand, so this file stays lean). Here: only the hard rules and
what's specific to this repo.

Code style: global `~/.claude/CLAUDE.md` — comment only the non-obvious *why*.

## Hard rules (override defaults)

- **v14 only, no v1 APIs.** Everything under `foundry.*`. Never `foundry.appv1`, bare
  `Application` / `FormApplication` / `Dialog`, or bare `mergeObject` / `duplicate` /
  `getProperty`. Windows are ApplicationV2; dialogs DialogV2; structured data is
  `foundry.abstract.DataModel` + `defineSchema()`. A v1-only class → find the V2 form first.
- **TypeScript everywhere, including tooling.** `vite.config.ts`, `svelte.config.ts`,
  and `scripts/*.ts` run via `node` (≥22.18 strips types by default — no `tsx`/`ts-node`). No
  `.mjs`/`.js` tooling. `package.json` pins `engines.node`.
- **UI is Svelte 5 mounted in an ApplicationV2 shell** (`mount`/`unmount`, runes) — not
  Svelte 4 forms (`new Component()`, `$destroy`, `export let`). See the skill's
  `svelte-in-applicationv2.md`.
- **No system coupling by default.** Nothing may assume a game system. Branch on
  `game.system.id` or add a `module.json` `relationships.systems` entry only when a feature
  genuinely requires one, and say so.
- **Types are `fvtt-types`** (`node_modules/fvtt-types`, aliased from
  `@league-of-foundry-developers/foundry-vtt-types`, pinned to an exact v14 beta). Two
  consequences: `game` is a lifecycle union — narrow with `if (!game.ready) return;` rather
  than casting to `ReadyGame`; and `game.settings.get/set` keys must be declared in
  `src/fvtt-config.d.ts` via `declare module 'fvtt-types/configuration'`.

## Build & dev

- `npm run build` → builds `packs/` from `packs/_source/` **and** `dist/` (both gitignored;
  build before enabling a world, and after edits).
- `npm run dev` — HMR dev server (`:30001`, proxies Foundry). `npm run watch` — `vite build --watch`.
  `npm run check` — `svelte-check` + `tsc`. `npm run setup` —
  resolve dev paths (detect/prompt), then scaffold the Foundry module dir + pull references in.
- **Test (verification loop):** `npm test` — vitest unit specs (zero-setup, the CI tier:
  `.github/workflows/ci.yml` runs `check` + `npm test` on every push to `main` and every PR,
  needs no secrets or Foundry install). `npm run test:e2e` — Playwright against a real headless
  Foundry (opt-in; needs a licensed Foundry + a migration-current world, so it's excluded
  from CI). Tiers, commands, preconditions, the check-harness-health discipline, and spec
  conventions live in the skill's `references/testing.md`.
- **Two ways the module lands in Foundry** (both put it at `modules/<id>/`):
  - `npm run setup` (dev) — a **real** module dir whose entries (`module.json`, `dist`, `lang`,
    `packs`, `assets`) symlink back to the repo, so edits + Vite HMR are live. NOT a whole-repo
    symlink (that leaked `node_modules`/`.git` and shipped no assets).
  - `npm run deploy` — `vite build`, then **copy** a clean, link-free, self-contained dir
    (same shape as the release zip). Use to test the shipped artifact or install without the repo.
- Art has **one source and one output**: it lives once in top-level `assets/` (beside `lang/`,
  `packs/`; not under `src/`, which is for built code) and ships once as a served file at
  `modules/<id>/assets/…` (dev symlink / `deploy` copy / release zip). **Reference it by that
  path** — from scene/tile content and from code alike (kingmaker and abomination-vaults do
  exactly this; their esmodules embed zero assets). Do NOT `import` art: in the lib build an
  import inlines a *second* copy into `dist/<id>.js`. When code needs an SVG's shapes live (e.g.
  to animate them), `fetch()` the served file and inline it.
  The served path must resolve in dev, `deploy`, and the release zip.
- Active install: `FoundryVTT` (a fresh v14 desktop install may use `FoundryVTT-v14`).
  References: `_system-source`, `_foundry-data`, `_foundry-modules`.

## This repo's specifics

- Module id `chat-filters`; flags, settings, the socket channel (`module.<id>`),
  and pack names (`<id>.<pack>`) all key off it. Use `const MODULE_ID`.
- Public API: `game.modules.get(MODULE_ID).api = {...}` (cast — `api` isn't typed on `Module`).
- `src/fvtt-config.d.ts` is the fvtt-types augmentation point: settings keys today, document
  or system types later. It needs its `export {}` to stay a module — without it the
  `declare module` becomes an ambient *replacement* instead of an augmentation.
- Strings: `lang/en.json` under `chat-filters.*`; `game.i18n.localize/format`. No hard-coded strings.
- compatibility `minimum "14"`, `verified "14"`; MIT license; org `rune-goblin`.
- Release: tag `vX.Y.Z` → `release.yml` stamps the version, type-checks, builds, publishes `module.json` + `chat-filters.zip` (zip ships `dist lang packs assets` — must include the art).
- **System coupling lives only in `src/adapters/`.** The search core (`src/search/`) must stay
  system-agnostic; a system adds facets through a `SystemAdapter` chosen by `game.system.id`.
- Search `game.messages`, never the rendered log: ChatLog renders messages in batches, so older
  ones are absent from the DOM. `src/ui/reveal.ts` renders batches until the target exists.
- Players search too, so the index must hold only what the current user's card shows: a match
  on hidden text tells the player the text is there. `buildRecord` keeps only `header` facets for
  blind rolls (`!isContentVisible`); a system that hides card content (PF2e `data-visibility`,
  hidden token names, check outcomes) supplies a `Redactor` and gates its own facets.

## Gotchas

- Compendium packs build from `packs/_source/<name>` → `packs/<name>` on `npm run build`
  (`scripts/pack.ts`; built LevelDB gitignored like `dist/`). Edit the JSON sources, not the
  LevelDB. If Foundry holds a pack open the build skips it with a warning (LevelDB lock) —
  close Foundry to refresh. `npm run init` rewrites the sources so a generated module's packs
  carry its id after the next build. Pack workflow: skill's `packs-cli.md`.
- **Distribution is derived, not a mode.** `scripts/pack.ts` ships what `module.json` registers:
  register an `Adventure` pack and `npm run build` *derives* it from the per-type sources
  (`scripts/build-adventure.ts`, keepId import → ids preserved → cross-links hold); register none
  and you get plain compendia. Runtime libraries (effects a rule grants in place by compendium UUID)
  go under `packs/_source/_library/<name>/` so they ship as compendia and stay out of the Adventure.
  Sources stay canonical (compendium UUIDs); the build rewrites bundled-pack refs to world UUIDs,
  `scripts/normalize-refs.ts` rewrites them back after an unpack. Don't default to an Adventure —
  imported docs are copies that go stale on module update; only *worlds to run* warrant it. Runtime
  side: `promptAdventureImport()` in `src/adventure.ts` (self-deactivates with no Adventure pack).
  Decision guide + workflow: README "Ship as an Adventure" and the skill's `packs-cli.md`.
- `dist/` is gitignored — served via the dev scaffold's `dist` symlink after build; CI builds it for releases.
- Vite does **not** type-check — run `npm run check` (the release workflow does too).
- `npm run dev` = Vite HMR dev server on `:30001` reverse-proxying Foundry (`:30000`). It proxies an *already-running* Foundry — start Foundry and **launch a world with the module enabled** first, or there's no esmodule to hot-swap. Then browse `:30001/game` (not `:30000`). `.svelte` edits hot-swap; editing `src/index.ts` full-reloads. `npm run watch` = old `vite build --watch` (browse `:30000`, manual F5; Foundry hot-reloads `.hbs`/`.css`/`.json` but not esmodules).
- Persist state in document flags, not raw socket; raw socket for transient signals only (skill's `multi-client-sync.md`).
