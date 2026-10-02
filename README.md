# Ledger

A personal finance app: track income and spending, see where the money goes, and save towards a
monthly goal. It runs in the browser (and as an iPhone Home Screen app), keeps all data on the
device, and works offline.

Live: https://machiana1122-oss.github.io/ledger-app/

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout (no code or styling inside) |
| `styles.css` | All the styling |
| `js/main.js` | Starts the app and connects everything |
| `js/store.js` | Holds the data, loads and saves it |
| `js/schema.js` | The data format: checks saved data and backups, and upgrades older formats |
| `js/calc.js` | Totals worked out from the transactions |
| `js/goal.js` | Savings goal numbers and the month/week rollover |
| `js/dates.js`, `js/money.js`, `js/html.js`, `js/util.js` | Small helpers |
| `js/quickadd.js` | Adding a transaction from a link (iPhone Shortcuts / Back Tap) |
| `js/offline.js`, `sw.js` | Offline support (the service worker) |
| `js/ui/` | One file per part of the screen: `overview`, `history`, `insights`, `settings`, `sheet` (add/edit), `backup` (export, import, erase), `donut`, `colors`, and `shell` (tabs, messages) |
| `manifest.webmanifest`, `icons/` | App name and icons for the Home Screen |

## How the code is organised

- **Data in one place.** `store.js` holds everything. Every change follows the same pattern:
  change the data, then call `commit()`, which saves it and redraws the tab on screen.
  Drawing code only reads the data; it never changes it.
- **Only facts are stored** (transactions, settings, what the savings goal was each month).
  Totals, weekly allowances and the savings history are worked out from the transactions, so they
  can never get out of step with them.
- **Money is stored in whole cents** (12.50 is stored as `1250`), so totals are always exact.
- **The saved data has a `version` number.** If the format changes, add the upgrade to
  `js/schema.js` and raise `SCHEMA_VERSION`. Older backups keep working.
- **Safe HTML.** Page content is built with the `html` template from `js/html.js`, which escapes
  every value, so nothing typed by the user (or inside a backup file) can turn into code.

## Running it on your computer

The app uses JavaScript modules, which browsers only load from a web address, so double-clicking
`index.html` won't work. From this folder, run:

```
python -m http.server 8000
```

then open http://localhost:8000.
