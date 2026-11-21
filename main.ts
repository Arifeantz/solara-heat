// Solara Heat — Port Solana: entry program for the make.fun "Make GTA 6" bounty.
//
// The game itself lives in game/ as plain static files and screenshots/ holds
// the maker's captures of it. This program hands the entry in: it copies both
// folders into the output directory and writes the dossier that the judge
// reads, using the kit's own dossier library so the bytes match the gate's
// rebuild exactly. It runs on Node 22 with the standard library only, does no
// network access, and writes the same bytes on every run.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The gate's published caps for this bounty, handed to buildDossier so the
// dossier it writes is the one the scorer rebuilds from the same files.
const GATE_CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

function entryRoot(): string {
  // In the grader the repository sits at MAKEFUN_BOT_DIR; anywhere else this
  // file's own folder is the repository root.
  const fromEnv = process.env.MAKEFUN_BOT_DIR;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  return dirname(fileURLToPath(import.meta.url));
}

function outputRoot(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  return '/output';
}

function main(): void {
  const root = entryRoot();
  const out = outputRoot();
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
  cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  const dossier = buildDossier(out, GATE_CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
}

main();
