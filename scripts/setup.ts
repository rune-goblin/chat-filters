// Dev environment setup. Idempotent. Run with `npm run setup`.
//   1. Personalize module.json — offer to fill the <your-org>/<your-name> placeholders
//      `npm run init` couldn't resolve (auto-detected from git; skipped on the template).
//   2. Find the Foundry data dir — detect per-platform, else ask for the path.
//   3. Resolve the game system source you build against — detect an installed system,
//      point at a checkout, or skip (core types ship via the fvtt-types dep, so it's optional).
//   4. Symlink references INTO the repo, then scaffold a *real* module dir in Foundry's
//      modules/ whose entries symlink back to the repo (see scaffoldDevModule).
// Resolved paths cache in .dev-paths.json (gitignored) so re-runs don't re-ask.
// Flags: --reconfigure (ask again), --no-link (resolve+cache only), --yes (no prompts).
import {
  existsSync, symlinkSync, lstatSync, unlinkSync, readFileSync, writeFileSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ownerFromOrigin, authorName, isValidOwner } from './git-identity.ts';

const repo = process.cwd();
const home = homedir();
const ID = 'chat-search';

const CONFIG = join(repo, '.dev-paths.json');

const argv = new Set(process.argv.slice(2));
const reconfigure = argv.has('--reconfigure');
const noLink = argv.has('--no-link');
const interactive = Boolean(stdin.isTTY) && !argv.has('--yes');

interface DevPaths {
  foundryData?: string;
  systemSource?: string;
}

const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;

// Ctrl+D / closed stdin mid-prompt rejects with AbortError — treat it as "cancel", not a crash.
async function prompt(line: string): Promise<string> {
  try {
    return (await rl!.question(line)).trim();
  } catch {
    console.log('\nCancelled.');
    rl?.close();
    process.exit(0);
  }
}

async function ask(question: string, fallback = ''): Promise<string> {
  if (!rl) return fallback;
  const answer = await prompt(`${question}${fallback ? ` [${fallback}]` : ''} `);
  return answer || fallback;
}

async function confirm(question: string, def = true): Promise<boolean> {
  if (!rl) return def;
  const answer = (await prompt(`${question} [${def ? 'Y/n' : 'y/N'}] `)).toLowerCase();
  return answer ? answer.startsWith('y') : def;
}

function expand(p: string): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

function readConfig(): DevPaths {
  if (!reconfigure && existsSync(CONFIG)) {
    try {
      return JSON.parse(readFileSync(CONFIG, 'utf8')) as DevPaths;
    } catch {
      /* malformed cache — start fresh */
    }
  }
  return {};
}

// Foundry's default user-data folders per platform. Recent desktop builds version the
// folder (FoundryVTT-v14); older/server installs use a plain FoundryVTT. v14-only — we
// check the v14 folder first, then the plain one, and use the first that resolves.
function userDataDirs(): string[] {
  let base: string;
  if (process.platform === 'darwin') base = join(home, 'Library/Application Support');
  else if (process.platform === 'win32') base = process.env.LOCALAPPDATA ?? join(home, 'AppData/Local');
  else base = process.env.XDG_DATA_HOME ?? join(home, '.local/share');
  return ['FoundryVTT-v14', 'FoundryVTT'].map((n) => join(base, n));
}

// The configured data dir lives in Config/options.json's `dataPath` (which may point
// elsewhere than the folder holding it), with content under `<dataPath>/Data`.
function dataDirFor(userData: string): string | null {
  const options = join(userData, 'Config', 'options.json');
  if (existsSync(options)) {
    try {
      const { dataPath } = JSON.parse(readFileSync(options, 'utf8')) as { dataPath?: string };
      if (dataPath) return join(dataPath, 'Data');
    } catch {
      /* malformed options.json — fall through to the conventional layout */
    }
  }
  const conventional = join(userData, 'Data');
  return existsSync(conventional) ? conventional : null;
}

function detectFoundryData(): string | null {
  if (process.env.FOUNDRY_DATA) return process.env.FOUNDRY_DATA;
  for (const ud of userDataDirs()) {
    const dd = dataDirFor(ud);
    if (dd && existsSync(dd)) return dd;
  }
  return null;
}

async function resolveFoundryData(cfg: DevPaths): Promise<string | undefined> {
  const found = (cfg.foundryData && existsSync(cfg.foundryData) ? cfg.foundryData : detectFoundryData()) || undefined;
  if (found) {
    console.log(`✓ Foundry data: ${found}`);
    return found;
  }
  console.log('• No Foundry data dir found (no Config/options.json at the default locations).');
  if (!interactive) {
    console.log('  Set FOUNDRY_DATA or run interactively to point at it; skipping Foundry links.');
    return undefined;
  }
  // Foundry picks/creates its own data dir — we only link into an existing one, never make it.
  const entered = expand(await ask('  Path to your Foundry Data dir (the folder holding modules/, worlds/):'));
  if (entered && existsSync(entered)) return entered;
  if (entered) console.log(`  ${entered} doesn't exist — skipping Foundry links.`);
  return undefined;
}

// Systems installed in the Foundry data dir, which is where a system's shipped code and
// templates actually live — usually the copy you want to read while building against it.
function installedSystems(foundryData: string | undefined): string[] {
  if (!foundryData) return [];
  const dir = join(foundryData, 'systems');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'system.json')))
    .map((e) => join(dir, e.name));
}

// Optional: a system checkout (or installed system dir) to read while authoring. Core Foundry
// types come from the fvtt-types dep, so nothing here is needed to compile.
async function resolveSystemSource(cfg: DevPaths, foundryData: string | undefined): Promise<string | undefined> {
  if (cfg.systemSource && existsSync(cfg.systemSource)) {
    console.log(`✓ System source: ${cfg.systemSource}`);
    return cfg.systemSource;
  }

  const installed = installedSystems(foundryData);
  if (!interactive) return installed.length === 1 ? installed[0] : undefined;

  if (installed.length) {
    console.log('• Systems installed in your Foundry data dir:');
    installed.forEach((p, i) => console.log(`    ${i + 1}. ${basename(p)}`));
    const answer = await ask('  Number to link, a path to a checkout, or [s]kip?', 's');
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= installed.length) return installed[index - 1];
    if (answer && !answer.toLowerCase().startsWith('s')) {
      const p = expand(answer);
      if (existsSync(p)) return p;
      console.log(`  ${p} doesn't exist — skipping.`);
    }
    return undefined;
  }

  console.log('• No installed system found (optional — core types come from the fvtt-types dep).');
  const p = expand(await ask('  Path to a system checkout, or blank to skip:'));
  if (!p) return undefined;
  if (existsSync(p)) return p;
  console.log(`  ${p} doesn't exist — skipping.`);
  return undefined;
}

// Windows can't make plain dir symlinks without admin; junctions need no privilege.
const symlinkType = process.platform === 'win32' ? 'junction' : undefined;

// allowMissing lets us link dist/ before it's built — a dangling link that resolves once
// `npm run build` (or the Vite dev server) produces it.
function link(linkPath: string, target: string, allowMissing = false): void {
  if (!allowMissing && !existsSync(target)) {
    console.log(`skip (missing target): ${basename(linkPath)} → ${target}`);
    return;
  }
  const st = lstatSync(linkPath, { throwIfNoEntry: false });
  if (st) {
    if (!st.isSymbolicLink()) {
      console.log(`skip (exists, not a symlink): ${linkPath}`);
      return;
    }
    unlinkSync(linkPath);
  }
  symlinkSync(target, linkPath, symlinkType);
  console.log(`linked ${basename(linkPath)} → ${target}`);
}

// Dev install: a *real* module dir whose entries symlink back to the repo, NOT one symlink
// pointing at the whole repo. The whole-repo form exposes node_modules/.git to Foundry's file
// picker, makes the repo's module.json the one Foundry loads, and ships nothing on its own —
// so any non-symlink install (a release, a copied folder) had no assets. Per-entry symlinks
// keep live edits and the Vite proxy's HMR while matching the shape `npm run deploy` copies.
// We link the content dirs (assets/lang/packs) + the manifest + dist; the TypeScript sources
// under src/ stay out of the module.
function scaffoldDevModule(modulesDir: string): void {
  const dest = join(modulesDir, ID);
  const st = lstatSync(dest, { throwIfNoEntry: false });
  if (st?.isSymbolicLink()) {
    unlinkSync(dest); // drop the legacy whole-repo symlink
  } else if (st && !st.isDirectory()) {
    console.log(`skip (exists, not a dir or symlink): ${dest}`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  link(join(dest, 'module.json'), join(repo, 'module.json'));
  link(join(dest, 'dist'), join(repo, 'dist'), true);
  link(join(dest, 'lang'), join(repo, 'lang'));
  link(join(dest, 'packs'), join(repo, 'packs'));
  link(join(dest, 'assets'), join(repo, 'assets'));
  console.log(`scaffolded dev module → ${dest}`);
}

const ORG_PLACEHOLDER = '<your-org>';
const AUTHOR_PLACEHOLDER = '<your-name>';

// init.ts deletes itself once it has run, so its presence means this is the un-initialized
// template — the placeholders are intentional there and must not be filled in.
async function resolveIdentity(): Promise<void> {
  if (existsSync(join(repo, 'scripts', 'init.ts'))) return;
  const manifestPath = join(repo, 'module.json');
  if (!existsSync(manifestPath)) return;
  const manifest = readFileSync(manifestPath, 'utf8');
  const needsOrg = manifest.includes(ORG_PLACEHOLDER);
  const needsAuthor = manifest.includes(AUTHOR_PLACEHOLDER);
  if (!needsOrg && !needsAuthor) return;

  const org = needsOrg ? ownerFromOrigin(repo) : undefined;
  const author = needsAuthor ? authorName(repo) : undefined;

  console.log('• module.json still has template placeholders:');
  if (needsOrg) console.log(`    owner  ${ORG_PLACEHOLDER}  →  ${org ?? '(no origin remote)'}`);
  if (needsAuthor) console.log(`    author ${AUTHOR_PLACEHOLDER}  →  ${author ?? '(git config user.name unset)'}`);

  if (!interactive) {
    console.log('  Re-run `npm run setup` interactively to fill them, or edit module.json.\n');
    return;
  }

  let finalOrg = org;
  if (needsOrg && !finalOrg) {
    const typed = await ask('  GitHub owner for the module.json URLs (blank to skip):');
    if (typed && isValidOwner(typed)) finalOrg = typed;
    else if (typed) console.log(`  "${typed}" isn't a valid GitHub owner — skipping owner.`);
  }
  const finalAuthor = needsAuthor ? author || (await ask('  Author name for module.json (blank to skip):')) : undefined;

  const changes = [
    finalAuthor && `author = ${finalAuthor}`,
    finalOrg && `owner = ${finalOrg}`,
  ].filter(Boolean);
  if (changes.length === 0) {
    console.log('  Left as placeholders.\n');
    return;
  }
  if (!(await confirm(`  Write ${changes.join(', ')} to module.json?`, true))) {
    console.log('  Left as placeholders.\n');
    return;
  }
  let updated = manifest;
  if (finalOrg) updated = updated.replaceAll(ORG_PLACEHOLDER, finalOrg);
  if (finalAuthor) updated = updated.replaceAll(AUTHOR_PLACEHOLDER, finalAuthor);
  writeFileSync(manifestPath, updated);
  console.log('  ✓ updated module.json\n');
}

const cfg = readConfig();
console.log('Setting up the dev environment…\n');

await resolveIdentity();

const foundryData = await resolveFoundryData(cfg);
const systemSource = await resolveSystemSource(cfg, foundryData);

if (foundryData || systemSource) {
  writeFileSync(CONFIG, `${JSON.stringify({ foundryData, systemSource }, null, 2)}\n`);
  console.log(`\nSaved paths to ${basename(CONFIG)} (gitignored) — re-run with --reconfigure to change.`);
}

if (noLink) {
  console.log('--no-link: resolved paths only, no symlinks created.');
  rl?.close();
} else if (!(await confirm('\nCreate the dev symlinks now?', true))) {
  console.log('Skipped symlinks. Run `npm run setup` again when ready.');
  rl?.close();
} else {
  console.log('');
  if (systemSource) link(join(repo, '_system-source'), systemSource);
  if (foundryData) {
    link(join(repo, '_foundry-data'), foundryData);
    link(join(repo, '_foundry-modules'), join(foundryData, 'modules'));
    const modulesDir = join(foundryData, 'modules');
    if (existsSync(modulesDir)) scaffoldDevModule(modulesDir);
    else console.log(`skip (no modules dir): ${modulesDir}`);
  }
  rl?.close();
}
