# Ledger

A personal finance app: track income and spending, see where the money goes, and save towards a
monthly goal. It runs in the browser (and as an iPhone Home Screen app), keeps all data on the
device, and works offline.

- **Overview** - your balance, money in / out / saved for the month (go back to any earlier month
  with the arrows), what's safe to spend per day to reach your savings goal, and spending by category.
- **Recurring** - rent, salary, subscriptions: tick "Repeat every month" when adding one. When it's
  due, Overview asks you to add it (one tap, or change it first) or skip it. Nothing is logged by itself.
- **Insights** - money in and out month by month, where it goes, and how each month's goal went.
- **Starting balance** (Settings) - what you had before you started logging, so the balance matches
  your real money.

Live: https://machiana1122-oss.github.io/ledger-app/

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout (no code or styling inside) |
| `styles.css` | All the styling |
| `js/main.js` | Starts the app and connects everything |
| `js/store.js` | Holds the data, loads and saves it |
| `js/schema.js` | The data format: checks saved data and backups, and upgrades older formats |
| `js/calc.js` | Totals worked out from the transactions (balance, months, the spending projection) |
| `js/goal.js` | Savings goal numbers (safe to spend per day) and the month rollover |
| `js/recurring.js` | Recurring transactions: which dates are due, adding or skipping them |
| `js/dates.js`, `js/money.js`, `js/html.js`, `js/util.js` | Small helpers |
| `js/quickadd.js` | Adding a transaction from a link (iPhone Shortcuts / Back Tap) |
| `js/offline.js`, `sw.js` | Offline support (the service worker) |
| `js/ui/` | One file per part of the screen: `overview`, `history`, `insights`, `settings`, `sheet` (add/edit transactions and recurring items), `backup` (export, import, erase), `donut` and `trend` (charts), `colors`, and `shell` (tabs, messages) |
| `manifest.webmanifest`, `icons/` | App name and icons for the Home Screen |

## How the code is organised

- **Data in one place.** `store.js` holds everything. Every change follows the same pattern:
  change the data, then call `commit()`, which saves it and redraws the tab on screen.
  Drawing code only reads the data; it never changes it.
- **Only facts are stored** (transactions, recurring items, settings, what the savings goal was
  each month). Balances, totals, what's safe to spend and the savings history are worked out from
  them, so they can never get out of step.
- **Recurring items remember the last date handled** (`doneThrough`), so each month is asked about
  once, in order, even after weeks away. Transactions added from one carry its `recurringId`.
- **Money is stored in whole cents** (12.50 is stored as `1250`), so totals are always exact.
- **The saved data has a `version` number** (currently 3). If the format changes, add the upgrade
  to `js/schema.js` and raise `SCHEMA_VERSION`. Older backups keep working, and data from a newer
  version of the app is never overwritten.
- **Safe HTML.** Page content is built with the `html` template from `js/html.js`, which escapes
  every value, so nothing typed by the user (or inside a backup file) can turn into code.

## Running it on your computer

The app uses JavaScript modules, which browsers only load from a web address, so double-clicking
`index.html` won't work. From this folder, run:

```
python -m http.server 8000
```

then open http://localhost:8000.
