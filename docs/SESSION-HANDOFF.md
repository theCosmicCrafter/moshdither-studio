# Session Handoff

Living pass-down note. Update it at the end of every session and commit it.
It lives in `docs/` on purpose: the previous handoff sat in `outputs/`, which is
gitignored, so it never travelled with the branch.

**Last updated:** 2026-09-10 02:30 · master `28c86bd` (PR #54 merged; CI, Security Gate and Secret Scan all green on master for the first time)

---

## Read this first

- **A STALE INSTALL WILL WASTE YOUR SESSION. This has now cost two of them.**
  `%LOCALAPPDATA%\MoshDither Studio\` is a *separate copy* of the app; editing
  the repo and running `tauri:dev` does NOT change it. Symptoms reported as app
  bugs -- "panels won't move", "preview is broken", "still black" -- were an
  install from the day before, missing every fix made since. Before believing any
  desktop-app bug report, check the dates:

      Get-Item "$env:LOCALAPPDATA\MoshDither Studio\moshdither-studio.exe" | Select LastWriteTime
      git log -1 --format=%cd

  If the exe is older than the fix, rebuild and reinstall before debugging
  anything. "Works in the browser but not the app" is this, until proven
  otherwise -- it is not a WebView2 quirk.
  A companion trap: the NSIS uninstaller does NOT remove `sam3-bridge.exe`, so a
  stale sidecar survives an uninstall/reinstall cycle. Check for it by hand.


- **CI runs now -- the repo went public on 2026-09-10 and Actions is free
  there.** Until then every check failed with "recent account payments have
  failed" and red CI meant nothing. It means something now, with two caveats:
  the Linux job is the first ever to run, so its first failures are
  environment (see "First CI runs" below), and **local gates (`npm run gate`)
  remain the real signal for Windows, the only platform anyone has verified.**
  Do not suggest enabling billing; nothing here needs it.
- **Never delete anything.** Removals go to `recycling/<YYYY-MM-DD>_<reason>/`
  with a row in `recycling/MANIFEST.md`. (`recycling/` is gitignored — local by
  design.)
- Feature branches only; conventional commits.

---

## State: builds, runs, and is ready to publish

`npm run gate` passes all 9 gates and `npm run tauri:build:no-sam3` exits 0,
producing NSIS ~156 MB + MSI ~185 MB. Version is **0.2.0**.

**SAM3 now works in an installed app** (as of 2026-09-08). It is a
*downloadable add-on* rather than part of the installer, because the sidecar is
2.9 GB and no Windows installer format takes a file over 2 GiB -- WiX answers
`LGHT0263`, NSIS fails to mmap it. Both measured. See
`src-tauri/src/sam3_addon.rs`.

To publish the add-on: `npm run build:sam3-sidecar`, then
`node scripts/publish-sam3-addon.mjs --upload`. The script splits both assets
into GitHub-sized parts, hashes them, writes the manifest and uploads via `gh`.
**The sidecar's SHA-256 is compiled into the app** (`EXPECTED_SIDECAR_SHA256`);
change the sidecar and you must update that constant and ship an app release,
by design -- a remote manifest must never decide which executable runs.

**Datamoshing no longer needs system Python** (as of 2026-09-08). It used to
shell out to `mosh_cli.py`, which needs an interpreter AND numpy; the installer
shipped neither, so `find_python()` fell back to whatever `python.exe` was on
PATH. That exists on a developer machine and on almost no user's, so the app's
signature feature was developer-only and nobody noticed. There is now a 24 MB
`mosh-cli` sidecar (`npm run build:mosh-sidecar`) in `externalBin`, verified end
to end against a real clip with no system Python involved.

**What is self-contained.** The core app is: all five sidecars (`ffmpeg`,
`ffprobe`, `ffgac`, `ffedit`, `mosh-cli`), the 35 LUTs, the Python backend and
the icons are all bundled. Effects, dithering, glitch, datamoshing, LUTs and
export need nothing from the internet.

## SAM3 ADD-ON PUBLISHED; REPO IS PUBLIC -- 2026-09-09 23:50

**The add-on is live.** `sam3-addon-v1` on GitHub carries the manifest, the
SAM licence, and four parts (3.06 GB sidecar + 3.45 GB checkpoint). Before
upload every part was hashed against the manifest, and the manifest's sidecar
hash was confirmed equal to `EXPECTED_SIDECAR_SHA256` compiled into the app --
a mismatch would have made users download 3 GB and be refused.

**It was unreachable anyway, and the audit missed why: the repo was PRIVATE.**
A private repo's release-download URLs 404 without auth, and the app sends
none (correctly -- a token cannot ship). So the SAM3 installer would have
404'd for every user, owner included, no matter what was uploaded. Resolved by
making the repo public (owner's decision; the app is MIT). Gate first: a
full-history TruffleHog scan of every commit and branch found **0 verified
secrets, no HF token**; the only non-fixture candidate is a literal
`mongodb://username:password@host` placeholder in an old findings doc. Then
PR #53 untracked this machine's `.claude/settings.local.json` and the
checkpoint bookkeeping (they stay in history; nothing secret), and made
`auto-prune-branches.yml` manual-only -- it deletes merged remote branches
on push and nightly, had never run because Actions was off, and going public
turns Actions on for free.

After the flip, anonymous curl: manifest HTTP 200 and byte-identical to the
staged one; all four parts HTTP 200 with the exact manifest sizes. The full
anonymous download-and-hash of all 6.5 GB then passed: every part's sha256
equals the manifest's.

**Actions now runs (free on public repos).** Secret Scan passed on master
immediately. CI and Security Gate ran for the first time ever and failed on
environment, not code; what each needed is in "First CI runs" below. The
memory note "Actions never runs" is obsolete and has been rewritten.

**Which checkpoint the add-on ships -- corrected.** It is `facebook/sam3`'s
`sam3.pt` (3,450,062,241 bytes, sha256 `9999e234...`), NOT SAM 3.1: the local
file was hashed and matches both the published manifest and the hub's LFS
digest for that file. `sam3_bridge.py`'s *fallback* download had defaulted to
`facebook/sam3.1` / `sam3.1_multiplex.pt` (3,502,755,717 bytes, a different
file this loader has never been run against) since 76610aa. The fallback is
now pinned to the add-on's exact bytes: repo `facebook/sam3`, revision
`3c879f39826c281e95690f02c7821c4de09afae7`, sha256-checked after download
(which also closes bandit B615). SAM 3.1 remains a candidate for add-on v2
*after* the loader is tested against it.

**Smaller SAM3? Checked on the hub, not from memory.** Meta ships one size
(860M; `facebook/sam3.1` from March 2026 is the same class, newer weights).
The 6.5 GB is 3.06 GB of PyTorch+CUDA runtime plus a 3.45 GB **fp32**
checkpoint -- a smaller model touches only the second half. Ranked by payoff:
(1) store the checkpoint in fp16: 3.45 -> ~1.7 GB, zero functional change,
half a day; evaluate SAM 3.1 at the same time; (2) `vil-uob/sam3-litetext-s0`
(Apache-2.0, 529M) keeps SAM3's full image encoder and only distils the text
encoder, so clicks/auto-mask are unchanged and text prompts lose a little
reach -- but its Apache tag is the distillers' claim over weights that still
contain Meta's ViT-H, and it is a `transformers` class, so a bridge rewrite;
(3) ONNX Runtime would kill the 3 GB sidecar and run on any GPU/CPU, but only
the point-tracker has a public ONNX export, not the text path. None of these
should block the beta; (1) is the obvious add-on v2.

## MEMORY, ESCAPING, FIRST CI RUNS -- 2026-09-10 (this session)

**Outcome:** everything below is merged as PR #54 (three commits, merge
`28c86bd`). On master: CI green (first passing Linux `cargo test`), Security
Gate green (Semgrep, Bandit, TruffleHog, CodeQL, Trivy, Snyk, cargo-deny,
npm audit), Secret Scan green. Local: full 10-gate regression three times
over the three commits. The rebuilt `mosh-cli` sidecar in `src-tauri/bin`
carries the JS-mode scratch-dir fix; the installer picks it up on the next
`tauri:build`.

**Still open after this session** (unchanged from the release checklist
unless noted): code signing; GPL corresponding-source tarballs; LUT
provenance; the `_MEI` reaper decision; SAM3 add-on download
cancel/resume/disk-space check; uninstall leaving 6.5 GB; add-on v2 (fp16
checkpoint, evaluate SAM 3.1 against the loader first); a rebuilt
`sam3-bridge` sidecar to carry the checkpoint-pin changes; the vendored
`pymosh/container/riff.py` CodeQL note; the owner-side pagefile setting.

**The datamosh "exit 4294967274" was the machine, not the code.** Both
reported failures -- Classic via mosh-cli (`ffmpeg ... -> orig_in_*.avi`) and
Slam Zoom via ffgac -- were `-22` (EINVAL) from a process that could not get
memory. Windows' *commit* charge was at 109.3 of a 109.7 GB limit (93.7 GB RAM
plus a fixed 16 GB pagefile) while 39 GB of RAM showed free; ComfyUI Desktop
held 21 GB committed and 27 GB of VRAM, with the GPU driver backing the spill
in system memory. At that level ffgac/ffmpeg exit -22, the bundled mosh-cli
dies in numpy (`OpenBLAS error: Memory allocation still failed after 10
retries`), PowerShell refuses to start (`0x800705AF`), and the app itself
died with an ACCESS_VIOLATION (log `moshdither-1789008513-77020.log`). After
ComfyUI was closed, the same commands -- same sidecar, same `\\?\` verbatim
input path, same config -- passed. Two red herrings were run down and
excluded on the way: the `\\?\` prefix (ffmpeg, ffgac and ffprobe all open
it, from Rust and from Python; a Bash-heredoc backslash mangle faked the
failure once) and frame rate (15 fps, jittered VFR at 90k timescale and 120
fps all encode to MPEG-2 and MPEG-4 fine).

What changed so it is diagnosable next time:
- `src-tauri/src/sysmem.rs` reads commit headroom (`GlobalMemoryStatusEx`);
  the export budget now plans from `min(free RAM, free commit)`; export,
  FFglitch apply and FFglitch preview refuse up front below 1 GiB with a
  sentence that names the binding limit; every child-process failure gets
  the same sentence appended when it applies.
- The fault handler logs the module and offset (`moshdither-studio.exe+0x...`
  with the base), the read/write address for an access violation, and the
  memory line -- the old log had only an ASLR'd address that could not be
  resolved afterwards.
- Owner-side: close GPU tools before exporting, and consider a
  system-managed pagefile (it is fixed at 16 GB, so the limit can never grow).

**Watermark text and fonts were broken, found while closing a CodeQL alert.**
`escape_path` never quoted or backslash-escaped `fontfile=`, so on Windows
`C\:\Windows\Fonts\arial.ttf` reached ffmpeg as `C:WindowsFontsarial.ttf`:
a custom font never loaded (drawtext falls back silently, exit 0). Worse,
`text='It\'s'` aborts the export outright ("No option name near ...") and
`50% off` lost everything after the `%`. All three were established by
rendering frames with the bundled ffmpeg 8.0 and comparing pixels against an
escaping-free `textfile=`/`expansion=none` reference -- exit codes are not
evidence here. One escaper now serves both values: quote for the graph
parser, escape `\ : , ;` for the option parser, splice `'` in from outside
the quotes, `expansion=none`; `\\?\` is stripped. Rust
(`escape_filter_value`) and TS (`escapeFilterValue`, dead at runtime but kept
identical) assert the same fixtures, and a Rust test re-runs the pixel
measurement whenever ffmpeg and the Windows fonts are present. Four legacy TS
test files that pinned the old strings (including bare-hex alpha, which
ffmpeg rejects) were rewritten to the measured behaviour.

**Adversarial review of the above, before it was committed.** Six
independent reviewers (memory, escaping, crash handler, Python, CI, scanner
honesty) produced 21 findings; each was attacked by three refuters and 14
survived a majority. All 13 real ones are fixed in the same commit; the
14th was a verification record that none of the scanner remediations is
cosmetic. The two that mattered most: (a) `validate_io_path` refused every
font under `C:\Windows\Fonts` -- the `windows` component rule -- so no
custom-font export could have run even with the escaping right; the system
font directories are now allowed roots (read-only use), with a test that
`..\System32` through it is still refused. (b) `ffmpeg_binary()` cannot fail
(its last resort is the bare name on PATH), so every "skip without ffmpeg"
test guard was dead and the Linux CI `cargo test` would have failed; tests
now gate on `ffmpeg_for_tests()`, which proves the binary runs, and the CI
job installs ffmpeg so they run rather than skip. Also from the review: a
commit reading of exactly 0 was being treated as "unknown" and waved through
(now fires); the refusal gated on free RAM as well as commit, which would
refuse a laptop that could page (commit only now); `escape_filter_value`
lost leading/trailing spaces (escaped now, pixel-verified); the checkpoint
copy went straight to the final path (`.part` + rename now, and a digest
mismatch evicts the cached file so a retry re-downloads); the SAM3 env
overrides dragged the facebook/sam3 revision along (pins apply only at the
defaults); the JS-effect modes wrote `tmp.mpg` into the inherited cwd and
leaked it on failure (`_scratch_dir` now, like the other modes -- sidecar
rebuilt through the new build script and re-run on Slam Zoom and Classic);
the `e2e-real-backend` CI job had its own stub list missing `mosh-cli`.

**First CI runs (public repo), and what each needed.**
- CI / Rust: Tauri's build script wants every `externalBin` present for the
  target; the stub loop lacked `mosh-cli`. Added.
- Security Gate / Semgrep: 2 blocking community findings (the job writes
  SARIF to a file, so the log never says which). Reproduced locally only
  after two detours: the Anaconda `pysemgrep.exe` is broken (`mcp.server.
  fastmcp`), and a venv under the long scratchpad path fails a DLL load
  ("filename too long") -- `%TEMP%\sgv` works; run `pysemgrep.exe` directly,
  and with `SEMGREP_SETTINGS_FILE` pointed at an empty file to see the
  community rules CI sees (the logged-in local scan adds Pro rules: 14
  `rust.actix.path-traversal` hits on a desktop app's own file dialogs, and a
  skill-doc example -- not CI's, left alone, listed here so nobody chases
  them). Fixed for real: `build-mosh-sidecar.py` keeps the argv-derived
  target triple off the PyInstaller command line (fixed `--name` into the
  work dir, `os.replace` into `bin/`), `generate-lut-thumbs.mjs` chooses the
  binary from a fixed table, and `mosh_cli.py`'s existing signed-off
  `nosemgrep` marker was one line off its match (the call had wrapped).
  Anonymous local scan: 0 findings.
- Security Gate / Bandit: B615, the checkpoint pin above.
- Security Gate / TruffleHog: `base: master` on a push to master is
  `master..master`; the action refuses it. Removed, matching the
  secret-scan job that passes.
- PR #54's own first run, three more: (1) CI's stable clippy is **1.98**
  (local was 1.97.1) and it added `chunks_exact_to_as_chunks` -- 66 sites
  rewritten to `as_chunks::<4>().0.iter()` / `as_chunks_mut::<4>().0
  .iter_mut()` by script, because clippy's own `--fix` suggestion for the
  `_mut` case is wrong (`.iter()`) and rolls itself back; plus two
  Linux-only lints in the `KillJob` stub path. `rustup toolchain install
  1.98.0 --component clippy` and `cargo +1.98.0 clippy --all-targets` is
  how to see what CI sees without changing the default toolchain.
  (2) Semgrep's SARIF carries `nosemgrep`-suppressed matches with
  `suppressions: inSource`; GitHub does not honour that, so the two
  signed-off markers became open "Semgrep OSS" alerts. The job now drops
  suppressed results with `jq` before upload. (3) CodeQL flagged the TS
  edge-whitespace escaper (a trailing `.replace` that adds backslashes
  reads as an escaper that forgot them) -- rewritten as a scan -- and two
  `except: pass` blocks in the bridge, now commented.
- Second CI run: Linux `cargo test` reached 688/689 -- the one failure was a
  real cross-platform bug, not the test: the web form of a bundled asset
  (`/overlays/dust.mp4`, `/lut/amatorka.png`) is not an absolute path on
  Windows but IS on Linux/macOS, where both locators sent it through the
  path guard as a file on the filesystem root. Both now recognise the
  bundled form before the absolute check; a LUT test covers both forms.
- The bridge edits (pin, atomic copy, eviction) affect only the *fallback*
  download; the published add-on v1 sidecar predates them and never takes
  that path because the add-on installs the checkpoint. They ship with the
  next sidecar build.
- CodeQL: `watermark.ts` (above), `external_script.py` uninitialised
  `script_path` (now raises), `publish-sam3-addon.mjs` stat-then-open race
  (`fstatSync` on the open descriptor). Left: vendored `pymosh/container/
  riff.py` missing `__init__`.

## BRANCHES -- 2026-09-09 23:20: everything live is on master

`master` = `2ec2f03` (PR #49 then PR #51). Every branch was inventoried
against it. Five branches still show commits "not in master" BY HASH, and all
five were verified to be already on master by another route, or harmful now:

| Branch | Verdict | Why |
|---|---|---|
| `fix/mask-texture-load-hang` (Aug 8) | superseded | `git merge-tree` produces master's tree unchanged: the 5 s timeout + onerror it adds are already at `EffectChain.ts:85-91` |
| `fix/hang-audit-freezes-and-cancellation` (Aug 9) | superseded | all three fixes present: `stackSignature` gone, `cpuRenderSignature` drives the loop, `live-preview-param-update.spec.ts` exists, `output_with_timeout` and `run_cancellable` in |
| `chore/recycle-legacy-sam3-rpc-backend` (Aug 12) | do NOT merge | the legacy files it removes are already gone; what it would still delete is `packages/python-backend/requirements.txt`, which `scripts/setup-sam3-env.py:19` reads |
| `ui/typography-consistency-pass` (Aug 9-10) | superseded | 13 conflicting files, all on the same lines PR #49's design-token work already changed; the tokens it introduces are on master |
| `origin/devin/register-skill` (Aug 3) | superseded | 2-file docs edit against a CLAUDE.md that has since been rewritten |

They are left in place (never-delete); merging any of them now is either a
no-op or a regression. `fix/export-keyframe-trim-offset` (today, the other
session's refactor of `time_offset` into `export_frame_time()` + 2 tests) was
the one live branch and is merged as PR #51.

## STATE OF THE TREE -- 2026-09-09 23:00 (read this first)

**Everything is committed and pushed.** `Cosmic/upbeat-golick-68081b` is at
`b37398f` locally and on origin (0 ahead / 0 behind), 119 commits ahead of
`origin/master`, 0 behind it. Full 10-gate run passed on that HEAD.
[PR #49](https://github.com/theCosmicCrafter/moshdither-studio/pull/49) is
retitled and its body describes the branch; it was still titled for the
UI-token fix it started as.

**Not aligned, deliberately left alone (not this session's work):**

* A second worktree, `.claude/worktrees/vigorous-northcutt-560e78` on branch
  `fix/export-keyframe-trim-offset`, has UNCOMMITTED edits to
  `src-tauri/src/commands.rs`. It is refactoring the committed `time_offset`
  into an `export_frame_time()` helper -- functionally identical to `345abcd`,
  not a double offset. Redundant polish from a session that started after the
  fix landed. If it commits, it merges cleanly; if it is abandoned, nothing is
  lost.
* The main checkout (`master`, `a099379`) has an uncommitted `.husky/pre-commit`
  that is an OLDER subset of the version already committed on this branch.
  Merging the PR supersedes it. The `references/` submodule noise there is
  vendored third-party state.
* Local `checkpoint/*` tags are not pushed (bookkeeping, not history).

**GitHub reported 11 Dependabot alerts on master (6 high, 5 moderate)** in the
push output. Dependabot DOES run on the free plan, unlike Actions, so this is
a real signal: `/security/dependabot`. Not investigated.

**Human steps before a public release, unchanged:** code signing; the SAM3
add-on upload (`npm run sam3:publish -- --upload`, ~6 GB); GPL
corresponding-source tarballs; LUT licence provenance; the `_MEI*` reaper
decision (37.8 GB leaked on this machine).

**Next code batch, in order:** SAM3 bridge death reported as a 300 s timeout;
add-on download with no cancel/resume/disk check; uninstall leaves 6.5 GB;
heavy work on the main UI thread ("Not Responding"); `run-parity.spec.ts`
compares two placeholder PNGs; CHANGELOG and THIRD-PARTY-NOTICES stale.

## Session 2026-09-09 (night): cancel kills the tree; the scan finally excludes

**Orphaned processes -- CONFIRMED empirically, then fixed.** mosh-cli and the
SAM3 bridge are PyInstaller `--onefile` bundles: the exe the app spawns is a
bootloader that spawns the real Python as a separate process, which spawns
ffmpeg/ffgac/ffedit. `child.kill()` reached the bootloader only. Measured on
this machine: `IsProcessInJob` false on all three, and killing the launcher
left the Python child and ffmpeg encoding at full CPU (intermittently -- two
of three runs happened to be clean, which is why the audit called it
"unknown"). Fix: `proc::KillJob`, a kill-on-close Job Object the child is
assigned to at spawn; every descendant inherits it and closing the handle
terminates the lot. Used by `run_cancellable` (datamosh) and `Sam3Engine`.
The `join_readers` on the early-return paths had to go too: `_job` drops at
`return`, AFTER the join, and the join could not finish while the orphan held
the pipe handles -- so the tree died only when the orphan finished on its own.
Red-first: the tree test took 29.4 s on the unfixed tree, 1 s after.

Not covered: non-Windows keeps the single-child kill. The `_MEI*` extraction
directory still leaks on a kill -- TerminateProcess skips the bootloader's
cleanup -- ~25 MB per mosh-cli cancel and **4.8 GB per SAM3 launch**; this
machine had ten of them, **37.8 GB**. Sweeping `%TEMP%\_MEI*` blindly is
unsafe (a live process may own one). The safe route is `--runtime-tmpdir` in
the two build-sidecar scripts plus a reaper beside `cleanup_stale_sam3_bridge`,
and that is an owner decision under never-delete-recycle-instead.

**Export memory: the budget is honest and the peak is lower.** The budget
bounded only the decoded Vec while the pipeline held two or three copies of
the clip beside it -- "4 GiB budget" meant 8-12 GiB in use, which on a laptop
is the commit limit and an abort with no log line. Two changes:

* *Lower the real peak.* The effects loop is in place: each frame is written
  back where it came from, and the mask is blended per frame against that
  frame's own previous contents, so the whole-sequence clone for the blend
  and the collect-into-a-second-Vec per effect are both gone (non-temporal:
  3x -> 1x plus one frame per rayon worker). The reader buffers are taken,
  not cloned. The temporal branch keeps 2x -- `Effect::process_video` returns
  an owned segment, so its input necessarily survives until the swap.
* *Plan for what remains.* `PIPELINE_PEAK_COPIES = 2` divides the budget ONCE
  in `adaptive_decode_memory_budget`; the plan, the decode cap and the still
  cap all read that per-copy number. The cap is raised to 8 GiB TOTAL so a
  machine with 16 GiB or more available keeps today's 4 GiB per-copy rung and
  today's real peak; small machines finally get a plan they can complete.
  Two reviewers independently caught that the first draft divided twice
  (B/4 for an animated still); `budget_honesty_tests` pins the arithmetic.

Found on the way and fixed: **every masked export with Frame Stutter (or any
frame-repeating datamosh) PANICKED** -- `prev[i]` indexed the pre-effect
clone past its end, because those effects return more frames than they take.
Now the blend is skipped with a warning to the UI ("changes the clip length,
so the mask could not be applied") instead of crashing the export.

`PeakWorkingSet64` should now be at most ~2x the logged "memory budget" line
(which is the per-copy number). Streaming decode is the self-contained
follow-up that would remove the transient decode copy.

**Export cancel is real now.** The flag was polled only inside the encoder's
write loop -- the last 15 % of an export -- so Cancel during decode or effects
changed nothing but the status text, while the job kept the export slot and
the next Export click queued silently behind it. Now: the decode's ffmpeg
child is polled every 100 ms and killed (`decode_video_cancellable`); the flag
is read between effects, per frame in both non-temporal branches, and in the
mask-blend pass; the encoder path is unchanged. NOT interruptible: one
temporal `process_video` pass -- tens of seconds on a long clip, with the
progress bar still -- because the Effect trait has no cancel hook. The UI
contract changed to match: Cancel means REQUESTED. `exportIsRunning` stays
true and the button reads "Cancelling..." until the backend returns; the
catch branches on the store flag, never on message text. A cancelled
FFglitch run used to leave the flag set forever, so the NEXT export's failure
read as a cancellation -- `finally` now resets it. Note the one global
`export_cancel` flag is also reset on entry by `apply_ffglitch`, which the
batch queue and the mosh preview reach without setting `exportIsRunning`.

**The pre-commit secret scan never excluded anything on Windows.** Its
`--exclude-paths` patterns were `name/`, matched against backslash paths, so
`recycling/`, `build-archive/` and `target/` were all scanned -- and TruffleHog
errors on the .msi installers there ("brotli: excessive input"), which the
script correctly reports as a FAILED scan and aborts the commit. Every commit
today got through only because that error was flaky; one did not. Patterns are
now `(^|[\/])name[\/]` and the scan takes 9 s instead of 35 s-2.5 min.

**Time base.** Trim runs before the effects loop, so per-frame `idx / fps`
counted from the in-point, while keyframes, the audio bake and the preview's
shader time are all absolute. One `time_offset` now; the bake is looked up by
TIME (it was indexed by the video's frame number, which also assumed equal fps).

*Follow-up, 2026-09-09 (branch `fix/export-keyframe-trim-offset`, off
`b37398f`; merge into `Cosmic/upbeat-golick-68081b`).* That fix went in under
the checkpoint commit `345abcd` ("checkpoint: before process-tree job
object"), so `git log --grep` will not find it and a bug report written
against `34f6341`'s line numbers reads as still open -- it is not. The
computation is now one function, `export_frame_time(trim_start, idx, fps)` in
`commands.rs`, used by all three branches (temporal takes frame 0 of the
segment), and pinned by two tests in `keyframe_export_tests`: the arithmetic,
and the regression itself (in-point 2 s + a 0->100 ramp over 4 s: frame 0 must
read 50, not 0). The audio side was already pinned by
`an_in_point_offset_reaches_the_right_audio` in `audio/mod.rs`.
Trap for a fresh worktree: `cargo test` does not compile until
`src-tauri/bin/` has the five sidecar exes (copy from another checkout or
`npm run fetch:external`), `npm ci` has run, and `npm run build` has produced
`dist/` -- `tauri::generate_context!` panics on a missing `frontendDist`.

**Video mask tracking recycled** (ADR 0006): per-frame auto_mask with no
identity, could not finish, rendered nowhere but the overlay.

## Session 2026-09-09 (latest): keyframes and audio bindings actually render

Two controls the UI advertised prominently and the exported file ignored. Both
are now evaluated per frame in Rust, from tracks/bindings carried in the export
payload, with tests asserting the Rust arithmetic matches the TypeScript the
preview uses -- because if they drift, the file stops matching what the user
approved on screen.

**Keyframes.** `EffectCall` carries the animated tracks; the export loop
evaluates them per frame in both the rayon and audio branches. Temporal effects
(datamosh) are handed the whole segment at once and have no per-frame parameter
hook, so they take the value at the START of the clip -- documented rather than
silently dropped. Params are re-clamped after injection, since the earlier clamp
ran on the static map.

**Audio bindings.** Dead in three separate ways:
  * the mapper computed a value every frame and wrote it only to
    `audioMappedValues`, read by a readout label and nothing else -- the
    parameter never moved, in preview OR export;
  * the readout looked up `currentValue[binding.source]` (i.e. `["bass"]`) but
    channels are keyed `${stackId}.${paramId}`, so it printed 0.000 always;
  * nothing was sent to the exporter.
Now driven through `updateStackParamsSilent` in the preview (same door keyframe
playback uses, so no undo pollution) and evaluated in Rust for the export.
Attack/decay is STATEFUL, so `AudioBindingSmoother` walks the clip in order and
carries per-channel state, mirroring `processChannel`.

Latent bug found on the way: channel names are `${stackId}.${paramId}` and
stack ids CONTAIN dots (`dither.bayer-1757...`), so any first-dot split tears
the id in half. `src/engine/audio/channelName.ts` splits on the last dot, with
tests.

**Precedence, decided deliberately:** when a parameter has both a keyframe and
an audio binding, the BINDING wins -- it is the more explicit instruction.
Applied consistently in preview and export.

Verified: all 10 gates.

## Session 2026-09-09 (later): release-readiness audit, and the export crash found

Asked directly: *"Is this production ready? Is this a finished product?"* A
seven-dimension read-only audit ran with adversarial verification (113 agents;
59 completed before the run hit usage credits, so 52 of the serious findings
carry a verdict and the rest carry evidence only). **106 distinct findings**,
11 of them blockers. Raw data: `evals/reports/audit-2026-09-09.md`.

**The export crash is explained and fixed.** `export_video` duplicates a still
image's one decoded frame `duration x fps` times to animate it -- and the
memory plan never saw it, because `probe_frame_count` reports 0 for a still, so
`plan_decode` planned for ONE frame, found it comfortably inside the budget and
chose native resolution. A 4032x3024 phone photo is 48.8 MB per frame; the
default 10 s at 30 fps is 300 of them = **14.6 GB**, and the per-effect rayon
collect doubles it. A failed Rust allocation ABORTS rather than panicking,
which is exactly why the log stopped after "Decoded 1 frames" with no panic
recorded. Fixed on both sides: `plan_decode_for_frames` plans against the count
the still becomes, and the clone itself is capped against half the budget
whatever the plan said. Pinned by `still_memory_plan_tests`.

**Also fixed in this batch (all verified in the source first):**

| What | Was |
|---|---|
| **Exports of non-16:9 footage were distorted** | The encoder ran a bare `scale=W:H`, which ignores source aspect. A 640x1146 vertical clip exported at "1080p HD" was squashed **3.2x horizontally** -- measured, not inferred. Now `force_original_aspect_ratio=decrease` + `pad`, verified against real FFmpeg |
| Long clips silently truncated / downscaled | The backend emitted `warning` and `downscaled_to` on `export-progress`; the UI destructured `{stage, progress, message}` and dropped both. Now surfaced, and kept on screen in a dismissible banner rather than a status line that scrolls away |
| **Open Project wiped the stack before validating** | `clearStack()` ran, then a `setTimeout` rebuilt with no shape check and no try/catch, and "Project loaded" was reported regardless. A file containing `{}` destroyed the open stack and threw a tick later. Now validated first, rebuilt in memory, applied as ONE undoable `replaceStack` |
| **"No mask" effects came out masked in exports** | Rust falls back to the global mask for any effect without its own; the Export panel was the ONLY caller that passed `activeMask` there (preview, Save Image and the batch queue all pass null), so an effect deliberately set to "No mask" was masked in the file and nowhere else |
| Datamosh modes had no knobs | `applyFfglitch(..., {}, ...)` at both call sites. `mosh_cli.py` had been parsing 30+ parameters the whole time. Now one table (`src/lib/ffglitchModes.ts`) drives controls, defaults, clamping and presets |
| Datamosh **preview** was broken for every mode | It passed `"params": null`, and `mosh_cli.py`'s first `params.get()` raised `'NoneType' object has no attribute 'get'`. Proven by running the sidecar directly; guarded now on both sides |
| Keyframe easing unreachable | Right-click a diamond: five easings and Delete |
| Mask undo covered only Clear/Invert | A store-level mask history; brush and eraser strokes, shapes, Clear and Invert all undo, capped at 30 |
| "Lock Aspect Ratio" wrote to the store and nothing read it | Wired to the export box (`src/utils/exportDimensions.ts`); works correctly *because* the encoder now letterboxes |
| "Use Proxy" checkbox wired to nothing | Recycled. It could not have worked: the video preview REQUIRES a proxy, so there was nothing to turn off |
| Tracks panel created layers nothing rendered | Recycled; store state kept for project-file compatibility |
| **The app-smoke gate's panic detection was dead code** | `$before` and `$log` were pipelines assigned to nothing, so `$log` was always null and the PANIC scan could never run -- the gate only checked "did it stay alive 20s". It also never rebuilt a stale exe, so it smoke-tested whatever binary was on disk. Both fixed |

**Method note for next time:** `cargo check` passes code that `cargo clippy -D
warnings` rejects. Run clippy before claiming a batch is clean; a gate run was
burned on a redundant cast.

## Session 2026-09-09 (late): UX fallacy sweep -- what changed and what is left

Driven by the owner's framing: "if there's a better, user-friendly,
industry-standard way of doing something, let's do it that way." A 5-dimension
audit ran with adversarial verification; every load-bearing claim was then
re-verified by hand before acting, because several earlier "findings" had been
my own tooling bugs.

**Fixed (all gated 10/10, committed):**

| What | Was |
|---|---|
| Every video treated as **10 seconds** | `getMediaMetadata` ran on open but only fed the metadata DISPLAY; `duration` sat at the store default, so playback stopped at 0:10 and an export with no out-point trimmed to 10s. Now set in `refreshPreview` |
| Console windows on datamosh export | Rust spawns were guarded; `mosh_cli.py` / `basic_modes.py` spawn ffmpeg THEMSELVES. Both now pass `CREATE_NO_WINDOW`; `scripts/check-no-console-windows.mjs` runs in prebuild and catches both languages |
| Preview mode choice | Gone. WebGL while interacting, exact CPU frame 450 ms after idle. Canvas now stays MOUNTED (the ternary unmounted it and a canvas gets one WebGL context for life -- black screen on play) |
| FFglitch modes invisible until export | `preview_ffglitch` moshes a 2s segment (1-2s per mode, cached); section labelled "Bitstream datamosh -- applied after your effects" |
| Mosh dropdown: 13 of 33, two of them broken | 25 verified-working modes, grouped |
| `ffglitchMode` + 7 export settings were component-local `useState` | In the store; `ffglitchMode` rides in presets (optional field, old libraries still load) |
| Recorded keyboard shortcuts did nothing | Editor writes palette ids (`undo`), handler switched on `edit:undo`; handler now falls through to the command registry |
| Save/Open Project only as Ctrl+S/O | In the File menu. `openProject` also never LOADED the media -- `mediaReloadToken` in the store now lets any path ask AppLayout to |
| Mask Clear/Invert destroyed work with no way back | One-step Undo |
| Proxy panel's output went nowhere | `proxyPath` had no readers; panel now feeds `proxyUrl` |
| Gate flaked on this machine | vitest pool capped at half the cores; app-smoke gate now sets `$LASTEXITCODE` explicitly instead of inheriting the previous gate's |

| **Timeline is a transport strip now**, not a dock panel | Pinned under the workspace; preview owns the centre column; keyframe diamonds (click = jump, right-click = delete), draggable in/out handles, dimmed trim. `LAYOUT_VERSION` 3 discards old saved layouts |
| **Timeline** (asked "what is it for, it seems clunky") | Stills played at **2x** -- three loops advanced `currentTime`; now `usePlaybackEngine` is the only clock, at the clip's real fps (`mediaFps` from ffprobe). In/out snapped to whole seconds; palette "Set in/out point" set 0/300 and "Play / pause" toggled audio; scrub drag died off the 16 px bar; `<video>` ignored in/out while playing and was offset by the in point; speed selector never reached the `<video>`; clip-length box overwrote a video's probed duration. All fixed; `docs/PRODUCT-REVIEW.md` §3 has the table and the redesign recommendation |

**Still open -- verified real, not yet fixed:**

- **7 of 8 tomato modes** (`bloom overlap jiggle void reverse invert random`)
  produce 0 bytes on real footage: the corrupted AVI has no decodable frame.
  Works on the 480x270 fixture, fails on every real clip at every size tried,
  so content-dependent. Inside vendored Tomato Automosh. They now fail with a
  sentence instead of a traceback, and are removed from the dropdown.
- **FFglitch mode parameters** are hardcoded `{}` at the call site; no mode's
  knobs are reachable. `combine`/`motion_transfer` need a second input with
  no UI to supply it.
- **Tracks panel** creates entries nothing renders or exports. Left in place;
  removing it from the rail is a product call.
- **Export crash (0xc0000374 heap corruption)** -- still not reproduced. NEW
  LEAD: this machine sits at 107 GB of a 110 GB Windows COMMIT limit
  (ComfyUI alone 12 GB) with 36 GB physical free; a gate run hit `rust_oom`.
  Windows refuses allocations at the commit limit regardless of free RAM, and
  export allocates hundreds of MB at once. Test: export with ComfyUI closed.
  Fix: raise the pagefile (16 GB on a 94 GB box).
- Undo still does not cover mask BRUSH STROKES, only Clear/Invert.
- Keyframe easing is always linear; no UI changes it. (Keyframes themselves
  are now visible and editable on the transport strip.)

## Verification: what has actually been exercised (2026-09-09)

Measured with `mosh-verify`, not read. Re-run any of these before a release.

| What | Result |
|---|---|
| `verify-all` | 99/99 effects, 0 failures |
| `render-all` on a photographic image | 99/99 render, 0 errors |
| Default calibration (measured) | 0 blacked out, 0 blown out, 0 flat |
| `animate-all` (still photo -> video) | 98/99 animate; `frame_hold` static by design |
| `audio-render` with a synthetic 120 BPM bake | 8/8 render; all 8 vary over time, 5 spike on beats |
| `render-luts` | 35/35, none blowing out |
| `test-all` | 49/49 |
| Export formats | 13/13 encoded and verified on disk (Rust test) |
| Video containers in | 8/8 decode (Rust test) |
| Still formats in | 11/11 decode; avif and dds REMOVED, no decoder exists |

**Use a photographic test image, not `tests/fixtures/test-image.png`.** That
fixture is a saturated colour chart -- 46% of its channels are pinned at 255 --
which makes `artistic.solarize` look like it blacks the frame out when it is
behaving correctly. It also hid the bloom white-out, because the chart's
aggregate is darker. The generator for a photographic image is in the session
scratchpad; regenerate one rather than trusting the chart for calibration work.

Still untested, honestly: individual parameter VALUES (only defaults were
swept), SAM3 segmentation quality (the add-on is not published yet), and
anything requiring real-world footage.

## Release checklist — what is left, and it is all human

Nothing below is blocked on code. Each is an action on the maintainer's own
accounts or hardware, which is why it is not done.

1. **Push the branch and open/merge the PR.** Outward-facing; never done
   without an explicit ask.
2. **Publish the SAM3 add-on** (~6 GB, one time):
   `npm run build:sam3-sidecar` then `node scripts/publish-sam3-addon.mjs --upload`.
   Then confirm `EXPECTED_SIDECAR_SHA256` in `src-tauri/src/sam3_addon.rs`
   matches what the script prints, and ship an app release if it changed.
3. **GPL corresponding source.** Attach the two tarballs named in
   `THIRD-PARTY-NOTICES.md` to the same GitHub release as the installer. This is
   a real obligation, not a nicety.
4. **Code signing.** Needs a purchased Authenticode certificate. Until then
   SmartScreen warns on first run; README says so plainly rather than hiding it.
5. **Optional: re-enable the updater.** Needs a published `latest.json` and a
   `TAURI_SIGNING_PRIVATE_KEY`. Restore the `plugins.updater` block in
   `tauri.conf.json` and the menu entry in `Toolbar.tsx` together.

Known, accepted: `src-tauri/Cargo.lock` is gitignored, so release builds are not
byte-reproducible. Pre-existing choice, left alone.

**What is not.**

1. *The SAM3 add-on has to be published once.* The mechanism is done and
   tested; the ~6 GB upload is a human step (see above). Until it is uploaded,
   the in-app installer reports that the asset list is unreachable and tells the
   user to build the sidecar locally instead.
   NOTE: `src-tauri/target/release/sam3-bridge.exe` is a STALE 297 MB CPU-only
   build from 2026-08-21 that cannot load the model. It is not bundled. Do not
   copy it into `src-tauri/bin/`.
2. *A fresh clone cannot build -- HALF FIXED (2026-09-05).* The four FFmpeg /
   FFglitch binaries are gitignored and were never committed, so losing
   `src-tauri/bin/` made the project unbuildable. `npm run fetch:external` now
   re-obtains them, pinned by `src-tauri/bin/SIDECARS.json` to the exact
   known-good versions (FFmpeg 8.0-essentials, FFglitch 0.10.2) and verified by
   SHA-256 before anything is installed. Proven by deleting a binary and
   recovering it byte-identically.
   STILL OPEN: `packages/python-backend/sam3_repo` is gitignored and needs a
   PATCHED clone (`weights_only=False`); see `docs/SAM3_SETUP.md`. Nothing
   automates that yet.
3. *Not code-signed.* `bundle.windows.certificateThumbprint` is null, so
   SmartScreen warns on every install.
4. *The updater is configured but dead.* A pubkey and a GitHub releases endpoint
   are set, but with no `TAURI_SIGNING_PRIVATE_KEY` the overlay disables updater
   artifacts -- and since Actions never runs on this account by choice, nothing
   will ever publish `latest.json`. Shipping a live updater endpoint that never
   serves anything is worse than shipping none; decide before any public release.

Version is still `0.1.0`.

---

## Closed this session

**The black preview had two independent causes. Both are fixed.**

*Cause 1 — LUTs stacked instead of swapping.* `addLUTEffect` appended a new
entry on every click, while the tile said "Apply <name>" and the status bar said
"LUT applied: <name>" in the singular. Each LUT grades the output of the one
before it, so browsing the library compounded them: on the test image (mean luma
124.8) four clicks on Gotham gave **2.5** — a black screen. Clicking a library
tile now swaps the current look in place, keeping any strength the user has
dialled in. Deliberate stacking is still available by duplicating the entry in
the effect stack. Measured first: no *single* LUT blacks out — the darkest of
the 35 lands at 0.65x source, and all 35 are correctly 512x512 — so lowering the
default strength would have weakened every look while leaving the real cause in
place.

*Cause 2 — REGRESSION I INTRODUCED, now reverted.* A `loseContext()` call was
added to `WebGLContext.destroy()` to fix a context leak. It made things strictly
worse: a canvas has exactly ONE WebGL context for its lifetime, `loseContext()`
is permanent, and PreviewViewport's init effect re-runs against the SAME canvas
(StrictMode in dev, and on any dependency change). The loss event fires a tick
LATER, by which time the re-initialised context has registered its listeners on
that canvas -- so the new context receives the old one's loss event and marks
itself dead. Result: a guaranteed black preview on every launch, confirmed in
`tauri:dev` output. Reverted; the leak is documented in the source as unfixed.
No automated guard exists -- SwiftShader implements WEBGL_lose_context
differently and a synthetic repro passes either way (verified in both
directions). Recognise a recurrence by this at startup:
`[WebGLContext] WebGL context lost` / `[Preview] WebGL context lost` /
`[EffectChain] render skipped` repeating.

*Original cause 2 — leaked WebGL contexts (STILL PRESENT, unfixed).* `WebGLContext.destroy()` freed GL
objects but never released the context; browsers cap live contexts at 16 and
force-lose the oldest, so every preview panel remount leaked one until the
browser killed the visible preview's context. Fixed with `loseContext()` in
`destroy()`, after listener removal. Proven with a SwiftShader Chromium harness
(24 cycles: 16 live before → 0 after). Full write-up and the four earlier wrong
diagnoses: [`docs/devlogs/2026-08-22-webgl-context-leak.md`](devlogs/2026-08-22-webgl-context-leak.md).
Regression cover: `tests/e2e/webgl-context-lifecycle.spec.ts`.

**Effect default-strength audit (99 effects).** All 99 rendered at their
defaults across four reference images (studio portrait, landscape, mountain,
repo test frame) with `mosh-verify render-all`, then ranked by mean per-channel
delta, luminance correlation and share of pixels changed. Agreed bar: a default
must read unmistakably as the effect; destructive effects should leave the
subject recognisable. One outright defect found and fixed --
`dithering.line_screen` inked by brightness instead of darkness, rendering every
image as its own tonal negative (correlation -0.60, now +0.56); see
[`docs/devlogs/2026-08-22-effect-default-audit.md`](devlogs/2026-08-22-effect-default-audit.md).
Contact sheet artifact: https://claude.ai/code/artifact/4479ae94-69b9-410f-af89-0f32b4bbc241

Four proposals are open and deliberately NOT applied (see "Open" below).

**Panels can now be rearranged.** `defaultLayout.ts` locked the centre (Preview)
and bottom (Timeline) tabsets with `enableDrop/enableDrag/enableDivide: false`.
The centre is the largest region of the window and the obvious place to aim a
panel, so dragging one there did nothing -- drag started, drop indicator drew,
drop refused. Confirmed by driving the layout directly: dropping Stack onto
Preview left the model byte-identical. Both zones now accept drops, drags and
divides; both tabs keep `enableClose: false` so they cannot be lost. NOTE the
drop itself is HTML5 drag-and-drop, which synthetic events cannot trigger --
verifying a rearrange end-to-end needs a real mouse.

**Effect names in the browser fallback were the shader's name.** `deriveName` in
`browserFallback.ts` returned the SHADER name for any effect whose shader was not
`pass_through`. Twelve datamoshing effects share `temporalDatamoshing` and all
read "Temporal Datamoshing"; 29 of 96 mapped effects showed a duplicated name.
Names now derive from the effect ID, with category-qualification for genuine
collisions (`pixel_geo.pixelate` vs `audio_reactive.pixelate`). This list is only
used when `__TAURI_INTERNALS__` is absent, so seeing it in the DESKTOP app would
mean the app had fallen back and lost its Rust backend -- worth checking if it
recurs there.

Earlier in the session: video export was totally broken (temp file lost the
destination extension) and now works; FFmpeg mid-write failures report FFmpeg's
own message instead of `os error 109`; the empty command palette; silent gate
failures and stale-binary false greens; non-deterministic LUT thumbnails; and
the whole SAM3 packaging chain — SAM3 is verified working end-to-end over its
real protocol (handshake → `auth_ok`, `load_image` → 1600x1216,
`text_prompt` → 3 hits, top score 0.924).

---

## Verifying export formats (read before trusting a format change)

`output_spec()` has unit tests, and they are NOT enough on their own: they
assert on the struct's fields, not that FFmpeg accepts the arguments those
fields produce. Image-sequence export shipped broken underneath a fully green
suite for exactly that reason -- the muxer rejects a fixed output filename, and
nothing in the tests ever ran FFmpeg.

Run the real argument sets against the bundled binary after touching a format:

    ffmpeg -f rawvideo -pix_fmt rgba -s 64x64 -r 30 -i raw.rgba            <the args output_spec builds> -y out.<ext>

Confirmed working this way on 2026-08-23: gif, apng, webp (single file), and
png/jpeg sequences (30 frames in, 30 files out).

## The `0x80070002` webview error is a restart race, not a defect

`ERROR tauri_runtime_wry: failed to create webview: 0x80070002 (file not found)`
appears at startup and the app then works normally. Investigated 2026-08-23 and
CLOSED as benign. Do not re-chase it without new evidence.

What was ruled out, each by experiment rather than reasoning:

- `transparent: true` -- error still occurs with it set to false.
- The window's `"url": "index.html"` -- error still occurs with it removed.
- Orphaned WebView2 processes from a previous run -- none belonged to this app.
- A missing WebView2 runtime -- v151.0.4129.101 is installed.

What settled it: `setup()` now logs which webviews exist, and a run that emitted
NO error reported `webviews: ["main"]` -- so the webview is created either way.
Then a genuinely clean launch (no prior instance, ten seconds of quiet first)
produced no error at all, while every single occurrence had followed a kill or a
dev hot-restart.

So the first creation attempt races a previous instance's WebView2 state and
Tauri recovers. The precise internals -- which file the loader cannot find --
remain unidentified; what is established is WHEN it happens and that nothing is
lost when it does. It is unrelated to the 0xc0000005 crash.

## Logging: how a failure reaches the log file

Fixed 2026-08-23 after a reported export failure left a log holding only three
startup lines. Four separate faults, each of which hid the next:

1. Release builds detach the console, so `console.error` went nowhere.
2. ~40 sites call `setStatusMessage` and NEVER the logger, so failures were UI
   text only.
3. The bridge between them matched PROSE, and the first message written after it
   shipped ("The original file is no longer available") matched none of its
   words. Neither did "WebGL context lost".
4. `export_video` validated its arguments BEFORE its first tracing call, so a
   rejected path returned with no trace at all.

`setStatusMessage(msg, level?)` now takes an explicit level. **Pass
`"error"` when reporting a failure** -- the regex that remains is only a net for
sites that do not, and widening it is a losing game ("No masks found for prompt"
cannot be matched robustly). Frontend warn/error forward to the Rust log through
`log_frontend`; uncaught errors and unhandled rejections are captured too.

Logs live at `~/.moshdither/logs/`, newest 20 kept, path available from
`get_log_path`.

## E2E is now gated, because it was the hole

`npm run gate` runs Playwright as gate 9 (~6.5 min; excluded from `-Quick`).
Before this, seven gates could pass while the app crashed on launch under the
Tauri mock -- which is exactly what a close-guard change did, undetected, and it
also let a real dock bug sit failing in the suite. If a change touches anything
the app renders, the gate now proves the app still renders.

## Adversarial audit, 2026-08-23

Hunting one specific class: **controls and messages that do not mean what they
say.** Every bug found this session was that shape, never a crash.

ALL FIVE FINDINGS ARE NOW FIXED:

1. **Pause now pauses.** Shader time is always the timeline's time; it used to
   fall back to `performance.now()` while stopped, so animated effects ran
   identically in both transport states. A paused preview now shows the frame
   under the playhead -- the same frame export writes.
2. **The app starts stopped.** `isPlaying` defaulted to true.
3. **`composite.overlay` and `color.lut_grading`** show an inline banner while
   waiting on a file selection, instead of silently behaving like a disabled
   effect. Driven by REQUIRES_SELECTION so a third case is one table entry.
4. **`datamoshing.beat_hold` / `beat_smear`** now have conversion-table entries.
   A missing entry is not the same as pass_through: it pushed the whole stack
   onto the slow CPU preview path. Every registered effect is now mapped.
5. **The seven unused Tauri commands** are documented in place above
   `invoke_handler` in lib.rs -- what each was for and why it is unwired -- so a
   later audit does not read them as broken. They are IPC surface for no
   benefit; drop the registration (not the function) if that trade sours.

CHECKED AND CLEAN -- do not re-audit these without new evidence:

- Every frontend `invoke()` resolves to a registered command. No runtime-missing
  commands.
- Every effect parameter declared in Rust is actually read. (An early grep said
  otherwise; it missed the `f32_param(params, "id", default)` helper
  indirection. False positive.)
- No `todo!()` / `unimplemented!()` in shipping code.
- No empty click handlers.
- All 169 store fields are read somewhere outside the store.
- Every panel in the registry is reachable, via the layout or the rail.

## Open

1. **Confirm the black preview is gone in a real build.** Both fixes are proven
   at the unit level but neither has been exercised by a human in the installed
   app. Two recipes, one per cause: (a) click through a dozen LUT tiles and check
   the image still reads — the effect stack should hold exactly one LUT entry;
   (b) move/dock/undock the Preview panel a dozen or more times and check the
   preview is still live. This is the one item that wants your hands, not mine.
2. **Consider marking the active LUT tile.** With swap semantics there is exactly
   one live look, but nothing in the gallery shows which. Not built — it is a
   design call, not a defect.
3. **Effect default retunes: reviewed and CLOSED, nothing changed.** The owner's
   rule is that an effect operating as designed is left alone; only output that
   is destroyed beyond being usable art gets touched. Under that rule all four
   proposals were declined, and two speculative edits were reverted:
   - `datamoshing.shuffle` -- `chunk_size` cannot fix it. `process_frame` does a
     *global* shuffle (`chunks.swap(i, j)` across the whole buffer), so a chunk
     from row 10 can land at row 500 at any chunk size. Raising 5 -> 20 was tried
     and still produced noise. Making it recognisable means changing the
     algorithm to a local/windowed shuffle -- a redesign, not a default. Left
     alone: a shuffle that shuffles is working.
   - `glitch.crc_mismatch`, `glitch.macroblock_glitch`, `analog.ghosting`: quiet
     but correct. Being faint is not breakage.
   - The 14 dithering effects and `dithering.custom_matrix` (`bayer2`): left
     alone. A 2x2 Bayer matrix is coarse *by nature*; that is the effect working.
     A `bayer2 -> bayer4` edit was made and reverted -- judging "is this usable
     art" from a dithered frame is the owner's call, not an agent's, and
     blockiness was being misread as breakage.

   The lesson: of 99 effects, exactly one had a defect that survives review, and
   it was the one identified by a *measurement* (negative correlation) rather
   than by an opinion about how the output looked.
4. **Mask controls** (mode selector, invert, clear, brush) are untested — they
   need a live SAM3 mask to drive them.
5. **`composite.overlay`** defaults to identity until an overlay is selected.
   Correct behaviour, but it lands the user on a control that appears to do
   nothing. Worth a placeholder or a disabled state.

---

## Testing notes that cost real time

- **Headless Chromium has no WebGL.** Renderer bugs are invisible to E2E unless
  Chromium is launched with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- The Tauri mock's `convertFileSrc` returns a `/mock-file/<path>` URL that 404s.
  Route it to a real file to give the WebGL chain genuine pixels:
  `page.route("**/mock-file/**", r => r.fulfill({ path: realImage }))`.
- Do **not** call `readPixels`/`drawImage` on the app's live GL context from a
  test — under SwiftShader that crashes the renderer and looks like an app crash.
- Flexlayout panel tabs are matched by `.flexlayout__tab_button`, and by
  `getByRole("tab")` only in some layouts — prefer the class.
- Never pipe a command whose exit code matters through `tail`/`head`; you get
  the pipe's status, not the command's.
- A "gate failure" with a burst of unrelated errors is usually resource
  contention from a concurrent PyInstaller/Rust build, not a regression. Re-run
  it alone before believing it.
