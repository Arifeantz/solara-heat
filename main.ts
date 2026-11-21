// main.ts — the hand-in program for Solara Heat: Port Solana.
//
// Run with Node 22 (`node main.ts`, no flags, no build, no install). It
// ships the game to the output directory and proves what it shipped:
//
//   1. It copies this repository's game/ and screenshots/ into the output
//      directory (MAKEFUN_OUTPUT_DIR, default /output), replacing whatever
//      an earlier run left in those two subdirectories.
//   2. It writes dossier.json beside them: the dossier of the shipped
//      directory, built by the kit's own library (vendor/makefun-game.ts,
//      used unchanged) under the bounty's caps, so the bytes are exactly
//      what the scorer recomputes from the same game/ and screenshots/.
//
// The source tree is the repository this file lives in — MAKEFUN_BOT_DIR
// when the grader sets it, otherwise the directory holding main.ts. The
// program reads nothing over the network and writes nothing outside the
// output directory. Run it twice over the same tree and the dossier is
// byte-identical: it is a function of the files' bytes and nothing else.

import { buildDossier } from './vendor/makefun-game.ts';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The bounty's caps, as its gate names them. Only text_max_bytes shapes
// the dossier's bytes; the rest only refuse input that is past them, so
// they are passed too — this program should fail where the scorer would.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// The two trees an entry hands in, and the dossier written beside them.
const TREES = ['game', 'screenshots'];
const DOSSIER_NAME = 'dossier.json';
const DOSSIER_SCHEMA = 'makefun/dossier/v1';

// Where the repository lives: the grader's bot directory when it is set,
// else this file's own directory (a plain `node main.ts` in the repo).
function sourceRoot(): string {
  const bot = process.env.MAKEFUN_BOT_DIR;
  if (bot !== undefined && bot.length > 0) return bot;
  return dirname(fileURLToPath(import.meta.url));
}

// Where the entry goes: MAKEFUN_OUTPUT_DIR, defaulting to /output.
function outputRoot(): string {
  const out = process.env.MAKEFUN_OUTPUT_DIR;
  if (out !== undefined && out.length > 0) return out;
  return '/output';
}

// Every file under dir, as paths relative to dir in code-unit order, with
// directories visited in the same order so the walk is deterministic.
// Symbolic links and special files are refused, as the dossier refuses
// them: an entry is plain files and directories only.
function listFiles(dir: string, rel: string, out: string[]): string[] {
  const entries = readdirSync(rel === '' ? dir : join(dir, rel), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
    const stat = lstatSync(join(dir, path));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      throw new Error(`${path}: a symbolic link or special file (an entry holds plain files only)`);
    }
    if (stat.isDirectory()) listFiles(dir, path, out);
    else out.push(path);
  }
  return out;
}

// Copy one tree (game/ or screenshots/) from the repository into the
// output directory, replacing the copy a previous run left there. Only
// the two named subdirectories of the output are ever removed — never
// the output directory itself, which may be a mount the grader owns.
// Every file is reported as it lands, so a hand-in watched live shows
// its progress instead of going quiet between the trees. Returns how
// many files were copied and their total size in bytes.
function copyTree(from: string, to: string, tree: string): { files: number; bytes: number } {
  if (!existsSync(from) || !lstatSync(from).isDirectory()) {
    throw new Error(`${from}: no such directory (an entry hands in its game/ and screenshots/)`);
  }
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  let files = 0;
  let bytes = 0;
  for (const rel of listFiles(from, '', [])) {
    const target = join(to, rel);
    mkdirSync(dirname(target), { recursive: true });
    const data = readFileSync(join(from, rel));
    writeFileSync(target, data);
    files += 1;
    bytes += data.length;
    console.log(`  ${tree}/${rel} — ${data.length} bytes`);
  }
  return { files, bytes };
}

// The screenshot manifest: the hand-in promises exactly these four
// frames, by name — a police chase, the open road, a live mission,
// and the town on foot. They are regenerated from the running game
// for every round, and this check is what keeps a stale, missing or
// wrong-format frame from shipping in their place: each file must
// exist, carry the JPEG magic bytes, and hold a real photograph's
// weight — more than a blank frame's few kilobytes, never more
// than the dossier's per-screenshot cap.
const EXPECTED_SCREENSHOTS = ['1-chase.jpg', '2-drive.jpg', '3-mission.jpg', '4-foot.jpg'];

function validateScreenshots(src: string): void {
  const dir = join(src, 'screenshots');
  const present = existsSync(dir) ? readdirSync(dir).sort() : [];
  const expected = EXPECTED_SCREENSHOTS.slice().sort();
  if (present.length !== expected.length || present.some((f, i) => f !== expected[i])) {
    throw new Error(
      `screenshots/: expected exactly ${expected.join(', ')} — found ${present.join(', ') || 'nothing'}`,
    );
  }
  for (const name of EXPECTED_SCREENSHOTS) {
    const data = readFileSync(join(dir, name));
    const isJpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    if (!isJpeg) throw new Error(`screenshots/${name}: not a JPEG (bad magic bytes)`);
    if (data.length < 8192) {
      throw new Error(`screenshots/${name}: only ${data.length} bytes — a real frame weighs more`);
    }
    if (data.length > CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name}: ${data.length} bytes exceeds the ${CAPS.screenshots.max_bytes}-byte cap`);
    }
    console.log(`  screenshots/${name} — manifest ok, ${data.length} bytes`);
  }
}

// The game's own entry points, by name: the page and the module it
// boots. A tree that lost either one is not a game, and the hand-in
// should say so itself rather than leave the scorer to find out.
function validateGameTree(src: string): void {
  for (const rel of ['index.html', 'src/main.js']) {
    if (!existsSync(join(src, 'game', rel))) {
      throw new Error(`game/${rel}: missing — the shipped game has no way in`);
    }
  }
  console.log('  game/index.html + game/src/main.js — entry points present');
}

function main(): void {
  const src = sourceRoot();
  const out = outputRoot();
  mkdirSync(out, { recursive: true });

  // Validate before shipping: the screenshot manifest and the
  // game's entry points are promises the dossier should not have
  // to make on faith.
  console.log('validating the hand-in:');
  validateScreenshots(src);
  validateGameTree(src);

  // Ship the two trees first: the dossier describes the output directory,
  // so it is built only once the copies are in place.
  let totalFiles = 0;
  let totalBytes = 0;
  for (const tree of TREES) {
    console.log(`${tree}/:`);
    const copied = copyTree(join(src, tree), join(out, tree), tree);
    totalFiles += copied.files;
    totalBytes += copied.bytes;
    console.log(`${tree}/: ${copied.files} files, ${copied.bytes} bytes`);
  }

  // Prove the copies before the dossier vouches for them: each output
  // tree must mirror its source exactly — the same relative paths in
  // the same order, every file the same size. A copy that quietly lost
  // or truncated a file is a failed hand-in, and it should fail here,
  // in this program's own voice, not later in the scorer's.
  for (const tree of TREES) {
    const srcFiles = listFiles(join(src, tree), '', []);
    const outFiles = listFiles(join(out, tree), '', []);
    if (srcFiles.length !== outFiles.length || srcFiles.some((f, i) => f !== outFiles[i])) {
      throw new Error(`${tree}/: the shipped copy does not mirror the source tree`);
    }
    for (const rel of srcFiles) {
      const a = lstatSync(join(src, tree, rel)).size;
      const b = lstatSync(join(out, tree, rel)).size;
      if (a !== b) throw new Error(`${tree}/${rel}: shipped ${b} bytes, source holds ${a}`);
      // Size alone would wave a same-length corruption through, so
      // the mirror check also compares a rolling byte hash of both
      // copies. It is not cryptography — it is a tripwire, priced at
      // one pass over bytes this program has already read once.
      const hash = (data: Buffer): number => {
        let h = 5381;
        for (let i = 0; i < data.length; i++) h = ((h * 33) ^ data[i]) >>> 0;
        return h;
      };
      const srcHash = hash(readFileSync(join(src, tree, rel)));
      const outHash = hash(readFileSync(join(out, tree, rel)));
      if (srcHash !== outHash) {
        throw new Error(`${tree}/${rel}: shipped copy's bytes differ from the source (hash ${outHash} != ${srcHash})`);
      }
    }
  }
  console.log(`copies verified: ${totalFiles} files mirror the source trees exactly, bytes and all`);

  // The dossier, from the kit library, over what was just shipped.
  const dossier = buildDossier(out, CAPS);
  writeFileSync(join(out, DOSSIER_NAME), dossier);

  // Read it back before declaring success: it must parse, and it must
  // name the schema the scorer expects. A dossier that does not read
  // back is a failed hand-in, and this program should say so loudly.
  const written = readFileSync(join(out, DOSSIER_NAME));
  if (written.length !== dossier.length) {
    throw new Error(`${DOSSIER_NAME}: wrote ${dossier.length} bytes, read back ${written.length}`);
  }
  const parsed: unknown = JSON.parse(written.toString('utf8'));
  if (
    typeof parsed !== 'object' || parsed === null ||
    (parsed as { schema?: unknown }).schema !== DOSSIER_SCHEMA
  ) {
    throw new Error(`${DOSSIER_NAME}: not a ${DOSSIER_SCHEMA} dossier`);
  }
  // And the strongest check this program can make: build the dossier a
  // second time, over the same shipped directory, and require the same
  // bytes. The dossier is a function of the files' bytes and nothing
  // else — if a rebuild disagrees, something outside the files (a
  // clock, a filesystem order, a stray write) has crept into the
  // hand-in, and the scorer's recomputation would catch it unkindly.
  const rebuilt = buildDossier(out, CAPS);
  if (rebuilt.length !== written.length || !Buffer.from(rebuilt).equals(written)) {
    throw new Error(`${DOSSIER_NAME}: a rebuild over the shipped directory disagrees — the dossier is not deterministic`);
  }
  console.log(`${DOSSIER_NAME}: ${written.length} bytes (${totalFiles} files, ${totalBytes} bytes shipped), rebuild byte-identical`);
}

main();
