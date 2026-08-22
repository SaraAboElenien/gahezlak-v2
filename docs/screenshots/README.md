# Screenshots

The 17 images embedded by the root `README.md`, in the order they appear there.

They were captured at 1920×1080 and are displayed at 900px wide, so they stay sharp on high-DPI screens.

## Naming

Files are numbered `01.png` … `17.png`. They arrived as `Screenshot (1299).png` and were renamed because spaces and parentheses in a path are fragile in Markdown and HTML `src` attributes — and because a reviewer who opens this directory sees the filenames.

If you add or reorder images, keep the numbering contiguous and update the `<img>` tags in the root `README.md` to match. An image in this directory that nothing references does not appear anywhere.

The reverse is worse and has already happened once: the set was 18 images until `07.png` was deleted without touching the root `README.md`, which left an `<img>` pointing at a file that no longer existed. GitHub renders that as a broken-image icon in the middle of the gallery on the repository's front page, and nothing in CI or the build looks at these paths — so it stayed that way across a push. The remaining files were renumbered to close the gap. **Deleting an image means editing the root `README.md` in the same commit.**

## Weight

The set is ~3.8 MB, which is the one thing worth watching: it is all downloaded when the README is opened. If it starts to feel slow, downscaling to ~1400px wide keeps them sharp at the 900px display size and cuts the total substantially, without changing format.

The CI image-size gate covers `frontend/public/` and `frontend/src/assets/` rather than `docs/`, so nothing here is enforced automatically.
