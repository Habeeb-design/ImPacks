# ImPacks — brand component demo

A 10-second, 1920 × 1080 / 60 fps concept film using ImPacks' actual React components, artwork, Inter typography, wordmark and product copy. Motion pacing takes inspiration from [Intently's Trust Wallet update](https://intently.agency/works/trustwallet); no reference footage, soundtrack or Trust Wallet branding is included.

## Deliverables

- `impacks-demo-10s.mp4`: H.264 / stereo AAC with fast-start playback.
- `poster.jpg` and `storyboard.jpg`: reveal frame and twelve-frame review.
- `soundtrack.wav`: original synthesized electronic sound bed and reveal accents.
- `render.py`: deterministic video compositor; renders with the exported production assets.
- `brand-assets/`: transparent component exports and Inter fonts with their OFL license.

## Brand source

`build-brand-assets.mjs` imports `PackArtwork`, `LandingHero` and `CardSpread` from `apps/web/src/components`. It extracts the existing `CardFace` function from `Dashboard.tsx` and the wordmark markup from `SiteHeader.tsx`, then renders them with the existing app CSS. No production app component is modified. The CTA uses the existing `primary open-pack-cta` styling. Desktop styles are frozen for export so narrow asset canvases do not trigger mobile breakpoints.

The pack collages retain the app's Bitcoin/Ethereum, sports and mixed-brand marks. Logo provenance remains documented in `apps/web/public/images/brands/SOURCES.md`. Inter files come from the same Google Fonts stylesheet referenced by `apps/web/src/styles.css`; their license is in `brand-assets/Inter-OFL.txt`.

The film uses the existing “Gamble on gambling.”, “Find your kind of chance.”, “Open a pack.”, “Reveal your bets.” and “Follow what happens next.” product copy. The dark end-card wordmark and CTA are color-inverted versions of the exported brand elements.

## Timing

| Time | Shot |
| --- | --- |
| 0–1.5 s | Actual homepage hero, orbit marks and headline |
| 1.5–3.4 s | Crypto / Chaos / Sports pack artwork |
| 3.4–5.0 s | Foil seam tear and card extraction |
| 5.0–7.55 s | Existing Dashboard collectible card treatment |
| 7.55–10 s | Wordmark, brand statement, CTA and demo URL |

This is a designed concept, not proof of live trading. Card data is an explicit local fixture using existing demo-market questions. Persistent concept labeling and the simulated-reveal caption disclose this. No payment, account or order API is called by the export pipeline.

## Re-render

Install `requirements.txt` in a Python environment. From this directory:

```sh
python3 render.py --preview
python3 render.py
```

To refresh component PNGs after a brand change, from the repository root run:

```sh
node docs/design/launch-video/build-brand-assets.mjs
python3 docs/design/launch-video/serve-brand-export.py
```

Open `http://127.0.0.1:8769/` and click **Export brand assets**. The loopback-only server accepts PNGs only for the ten fixed asset names and writes them into `brand-assets/`. The page and bundled component code are generated/ignored files. Close the server after export. Then rerun the renderer.

## Verification

The component exports and twelve-frame storyboard were visually reviewed. Python syntax, JavaScript syntax and focused whitespace checks passed. The final MP4 is checked with a full decode and assertions for 10.00 seconds, 600 frames, 1920 × 1080 and 60 fps. App tests/builds are not applicable to this isolated media change; concurrent app work is outside this artifact's validation.
