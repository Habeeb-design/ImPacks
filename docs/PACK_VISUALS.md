# Collectible card presentation

The reveal and collection use CardVisual; inspectable results use PredictionCard.
Only presentation changes: no network call, purchase, trade or random selection is
performed by replay, skip, tilt or rarity. Existing requestAnimationFrame/foil
animation is reused; no animation dependency was installed.

Finishes (Common silver, Rare blue, Epic purple, Legendary gold) are cosmetic.
A deterministic hash of the stored market ID and side selects one of four finishes.
This is not Gemini metadata, scarcity, odds, value or a promise about allocation.
Labels say cosmetic; the underlying market question remains available through
Inspect market question and the collection inspection dialog.

Card DTOs have no structured asset/category metadata. Conservative whole-word
matching against the actual question identifies Bitcoin, Ethereum, Solana, NBA,
WNBA, NFL, MLB, NVIDIA, eBay, Spotify and NOAA. Existing repository logo files and
source/license records are reused; no external image endpoint is called. Multiple
matched brands fall back to the edition/category instead of selecting arbitrarily.
Solana uses a local vector rendition of its three-bar mark.
resolveCardVisual selects sport-specific line artwork (soccer, American football,
basketball, baseball, hockey, tennis). Ambiguous multi-sport questions use a trophy.
Bare football means soccer; explicit NFL/quarterback/touchdown means American football.
Overtime alone only implies sports within a sports edition. Unknown subjects use
category artwork: trophy, blockchain cube, chart, civic building, weather, chip,
music or news. SVG artwork is decorative and inherits the rarity accent.
Future structured sport/asset IDs would improve wording and locale ambiguity. An image load failure
also uses the badge. No brand is inferred from price, side or arbitrary market IDs.

Spend and quantities come from the returned order. Pending/failed/unknown orders
never imply confirmed holdings. Confirmed holdings use remaining quantity when
available; closed cards show zero future payout. Conditional gross payout is $1
per remaining winning contract, not a net return; fees are not deducted. Titles
are shortened original questions, never invented predictions.

The reveal keeps native dialog focus, Escape/close, pause, skip and replay. Reduced
motion jumps directly to results and disables card reflections/tilt. Desktop uses
three centered cards; smaller viewports use a scrollable single column. Large packs
retain the bounded timeline and responsive grid. Stop the running Next production
server before rebuilding, then restart it to avoid mismatched CSS/JS chunks.
