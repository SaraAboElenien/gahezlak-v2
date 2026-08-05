# Screenshots

The 18 images embedded by the root `README.md`, in the order they appear there.

They were captured at 1920×1080 and are displayed at 900px wide, so they stay sharp on high-DPI screens.

## Naming

Files are numbered `01.png` … `18.png`. They arrived as `Screenshot (1299).png` and were renamed because spaces and parentheses in a path are fragile in Markdown and HTML `src` attributes — and because a reviewer who opens this directory sees the filenames.

If you add or reorder images, keep the numbering contiguous and update the `<img>` tags in the root `README.md` to match. An image in this directory that nothing references does not appear anywhere.

## Weight

The set is ~8.7 MB, which is the one thing worth watching: it is all downloaded when the README is opened. If it starts to feel slow, downscaling to ~1400px wide keeps them sharp at the 900px display size and cuts the total substantially, without changing format.

The CI image-size gate covers `frontend/public/` and `frontend/src/assets/` rather than `docs/`, so nothing here is enforced automatically.
