# Third-party notices

MoshDither Studio's own source code is licensed under the MIT License (see
[`LICENSE`](LICENSE)). That has not changed and does not change here.

The **installer**, and the **add-ons the app downloads after install**, also
carry software written by other people under other licences. This file names
every one of them, says which licence applies, and says where to get its source.
Full licence texts live in [`licenses/`](licenses/) and are installed alongside
the application.

Nothing in this file grants you rights over MoshDither Studio's own code beyond
the MIT License, and nothing in it restricts the rights the licences below give
you over their respective components.

---

## Why the app's own MIT licence still applies

MoshDither Studio invokes FFmpeg, FFglitch and the SAM3 bridge as **separate
processes** — `std::process::Command`, passing file paths and arguments. It does
not link against them, does not share an address space with them, and does not
exchange internal data structures with them.

The FSF's own guidance on this is direct: *"The installer and the files it
installs are separate works"* (GPL FAQ, `#GPLCompatInstaller`), and *"pipes,
sockets and command-line arguments are communication mechanisms normally used
between two separate programs"* (`#MereAggregation`). GPLv3 §5 states it in the
licence text itself: *"Inclusion of a covered work in an aggregate does not cause
this License to apply to the other parts of the aggregate."*

So the obligation created by shipping these binaries is to **convey those
binaries properly** — licence text, intact notices, and access to their
corresponding source — not to relicense this project. That is what this file and
`licenses/` exist to satisfy.

This is the mainstream reading, not a court ruling; the boundary is a legal
judgement call and this document is not legal advice.

---

## Redistributed in the installer

### FFmpeg — `ffmpeg.exe`, `ffprobe.exe`

| | |
|---|---|
| Version | `8.0-essentials_build-www.gyan.dev` |
| Licence | **GPL v3 or later** |
| Upstream | https://ffmpeg.org |
| Build supplier | https://www.gyan.dev/ffmpeg/builds/ |
| Licence text | [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt) |
| Build provenance | [`licenses/ffmpeg-BUILD-INFO.txt`](licenses/ffmpeg-BUILD-INFO.txt) |
| Source | https://ffmpeg.org/releases/ffmpeg-8.0.tar.xz — also mirrored beside each release (see the release checklist below) |

This build is GPL rather than LGPL because it was configured with
`--enable-gpl --enable-version3`, which is what enables `libx264`, `libx265` and
`libxvid`. The complete configure line is recorded verbatim in the build-info
file — that file is generated from the shipped binary itself, not transcribed.

### FFglitch — `ffgac.exe`, `ffedit.exe`

| | |
|---|---|
| Version | `ffglitch-0.10.2` |
| Licence | **GPL v2 or later** |
| Upstream | https://ffglitch.org |
| Licence text | [`licenses/GPL-2.0.txt`](licenses/GPL-2.0.txt) |
| Build provenance | [`licenses/ffglitch-BUILD-INFO.txt`](licenses/ffglitch-BUILD-INFO.txt) |
| Source | https://ffglitch.org/pub/src/ffglitch-0.10.2.tar.xz — also mirrored beside each release |

FFglitch is a fork of FFmpeg by Ramiro Polla. It provides the bitstream-level
motion-vector and coefficient editing that this app's datamoshing is built on.

Because FFglitch is GPL **v2 or later**, this project elects to convey all four
binaries above under the terms of **GPL v3**, so one uniform set of obligations
applies rather than two.

---

## Downloaded after install (the SAM3 add-on)

These are **not** in the installer. The app fetches them on request, because a
Windows installer cannot carry a file larger than 2 GiB in either format
(WiX rejects it with `LGHT0263`; NSIS fails to memory-map it) and both of these
exceed that.

### SAM 3 model weights — `sam3.pt`

| | |
|---|---|
| Source model | `facebook/sam3.1`, file `sam3.1_multiplex.pt` (~3.2 GB) |
| Licence | **SAM License** (Meta), dated 2025-11-19 |
| Licence text | [`licenses/SAM-LICENSE.txt`](licenses/SAM-LICENSE.txt) |
| Upstream | https://huggingface.co/facebook/sam3.1 |

The SAM License permits redistribution: §1.a grants the right to *"use,
reproduce, distribute, copy"* the SAM Materials, which are defined to include
*"trained model weights"*. §1.b.i imposes one condition on doing so — *"you shall
provide a copy of this Agreement with any such SAM Materials"* — which is why
`licenses/SAM-LICENSE.txt` ships with the app and is presented before download.

Acceptance is by use: *"By using or distributing any portion or element of the
SAM Materials, you agree to be bound by this Agreement."*

Users of this app are bound by that Agreement, including its restrictions on
military, weapons, nuclear and espionage use (§1.b.v), its export-control and
privacy requirements (§1.b.iii), and its prohibition on reverse-engineering the
underlying components (§1.b.iv). Read the full text before use.

### SAM3 bridge sidecar — `sam3-bridge.exe`

A PyInstaller bundle of the Python inference bridge. It contains, among others,
PyTorch, torchvision, timm, OpenCV, NumPy, SciPy, Triton and `huggingface_hub`,
plus Meta's `sam3` inference source (SAM License, as above). These carry their
own licences — predominantly BSD-3-Clause, Apache-2.0 and MIT — which are
included inside the bundle as distributed by their respective projects.

---

## Release checklist (GPL corresponding source)

Do this for **every** public release that includes the FFmpeg or FFglitch
binaries. GPLv3 §6(d) lets the source live somewhere other than next to the
installer, but only if clear directions sit beside the binary — which is what
this file is. Keeping our own mirror is the safer reading, because upstream URLs
move and the obligation does not expire when they do.

1. Download the two source tarballs named above.
2. Attach both to the same release as the installer, or host them where this
   file's links point, and keep them reachable for as long as the binaries are.
3. Confirm the two `licenses/*-BUILD-INFO.txt` files still match the shipped
   binaries — regenerate them if the sidecars were updated
   (`ffmpeg -version` / `ffgac -version`).
4. Do not repackage the binaries under different names or strip their `-version`
   and `-L` banners; those notices must stay intact.

`scripts/verify-external-bins.mjs` checks the binaries against the pinned hashes
in `src-tauri/bin/SIDECARS.json`. It does not check this file — that is a human
step.
