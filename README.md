# Ledger

A personal finance app: track income and spending, see where the money goes, and save towards a
monthly goal. It runs in the browser (and as an iPhone Home Screen app), keeps all data on the
device, and works offline.

- **Overview**: your balance, money in / out / saved for the month (go back to any earlier month
  with the arrows), what's safe to spend per day to reach your savings goal, and spending by category
  (tap a category in the chart or the list to see its amount and share. each category has its own colour).
- **Recurring**: rent, salary, subscriptions: tick "Repeat every month" when adding one. When it's
  due, Overview asks you to add it (one tap, or change it first) or skip it. Nothing is logged by itself.
- **Months start on payday**: paid at the end of the month? Tick "Counts for next month" on your
  salary: the next month starts the day it arrives, and everything from then on counts for that
  month. Months, totals, the goal, charts and History all follow it. A salary that comes late
  (after the 1st) moves nothing.
- **History**: every transaction by month, with each month's money in and out. Search or filter,
  and a line shows how many were found and their total.
- **Insights**: money in and out month by month, where it goes, and how each month's goal went.
- **Starting balance** (Settings): what you had before you started logging, so the balance matches
  your real money.
- **On a laptop** (a window 900px wide or more) , a sidebar instead of the tab bar, Overview as a
  dashboard with your recent transactions, History as a table, and adding or editing in a dialog
  (Esc closes it, Enter saves). Keyboard shortcuts: **N** adds a transaction, **/** searches
  History, **← / →** change the month on Overview. Each device keeps its own data: entering
  transactions on both needs syncing, which Ledger doesn't do yet.

Live: https://machiana1122-oss.github.io/ledger-app/

## Running it on your computer

The app uses JavaScript modules, which browsers only load from a web address, so double-clicking
`index.html` won't work. From this folder, run:

```
python -m http.server 8000
```

then open http://localhost:8000.
