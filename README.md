# Mob Wars City Scripts

Small collection of Tampermonkey/Greasemonkey userscripts for [Mob Wars City](https://mobwarscity.com/). These scripts focus on quality-of-life improvements, automation helpers, UI cleanup, and event tracking.

## What Is Included

### Gameplay helpers

- `MWC-PublicSmartHub.user.js` - Boss fight control panel with synced respawn timers, public fight tracking, auto-confirm helpers, optional auto-public behavior, and quick-ops tracking.
- `MWC-SmartBlackJack.user.js` - Adds blackjack basic-strategy assistance and one-button autoplay on the blackjack page.
- `MWC-Waterboard.user.js` - Adds waterboard shortcuts for low-energy players on boss fight pages and handles redirect flow after low-energy errors.

### Bud and warehouse tools

- `MWC-CollectAllBuds.user.js` - Adds a `Collect All Buds` button above the warehouse plant grid.
- `highlight-buds.user.js` - Visually highlights warehouse buds and the bud counter when harvestable buds are available.

### Event and utility scripts

- `MWC-Easter.user.js` - Alerts when Easter eggs spawn and includes support for special egg hunting.
- `MWC-HouseOptimizer.user.js` - Extracts house amenity data from the item guide for planning and comparison.
- `ui-overhaul.user.js` - Restyles parts of the Mob Wars City interface with cleaner buttons and layout improvements.

## Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. Open the script file you want from this repository.
3. Copy the script contents into a new userscript, or install it directly from a raw GitHub URL if you publish one.
4. Visit Mob Wars City and confirm the script is enabled.

## Compatibility

- Target site: `mobwarscity.com`
- Script format: userscripts (`*.user.js`)
- Intended for browser extensions that support standard userscript metadata and APIs

Some scripts use Tampermonkey-specific grants such as `GM_addStyle`, `GM_getValue`, `GM_setValue`, and `GM_notification`, so Tampermonkey is the safest default.

## Notes

- These scripts are unofficial and are not affiliated with Mob Wars City.
- Features may break if the game changes its HTML structure, page routes, or internal behavior.
- Some scripts are broad site-wide enhancements, while others only activate on specific pages such as blackjack, item guide, or boss fights.

## Contributing

If you update selectors, page handling, or game-specific logic, keep changes narrowly scoped and test on the relevant Mob Wars City page before committing.
