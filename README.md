# Tech-Moms SQL Studio

A beginner-friendly, static SQL learning website. No database account, backend, or API key required. The name and editable teal/peach visual treatment are a proposed Tech-Moms design, not an official brand asset package.

## Run

Install Node.js (version 20 or newer), open this folder in a terminal, and run:

```
node server.mjs
```

Open http://127.0.0.1:4173. Use an HTTP server rather than opening index.html directly: the database runs in a Web Worker. For deployment, upload index.html, styles.css, app.js, db-worker.js, and logo.svg to any static HTTPS hosting service. No build step is needed. The included server listens only on your own computer and is for local preview.

## Features

- Real SQLite via sql.js / WebAssembly, running inside a worker.
- Ace SQL editor with highlighting, line numbers, table/column completion, approximate error squiggles, gutter messages, and Ctrl+Enter / Command+Enter.
- Run highlighted SQL or the whole editor; multiple statements and result tabs.
- Beginner error explanations and four starter lessons, including JOIN.
- CSV uploads with quoted-field parsing, header validation, inferred numeric types, and safe quoted identifiers / bound values. Empty cells become NULL. Leading-zero identifiers remain text. Existing table names get a suffix.
- Dataset and column browser, session query history, CSV result export.
- Table previews, column insertion, and autocomplete use plain identifiers such as customers and customer_id. Quotes are added only for SQL keywords or names containing spaces, punctuation, or other special characters.
- Full database download and reopening, plus sample-data reset.
- Timeout / Stop terminates the SQL worker and recovers the last completed database snapshot. Failed runs restore their database snapshot, including earlier statements from that run.
- Responsive layout, semantic controls, visible keyboard focus, text-based status updates, safe text rendering of dataset values.

## Practical limits

- **SQLite dialect**, not SQL Server, PostgreSQL, or MySQL. Some syntax differs.
- Uploads: CSV up to 10 MB, 50,000 rows, and 200 columns. Database reopening: 20 MB. These are classroom guardrails rather than guarantees about available device memory.
- Result rendering and CSV export include up to 500 rows **per result**. The UI reports the full result row count. Use LIMIT / WHERE for larger datasets. SQL statements still execute to completion, including writes with RETURNING.
- Tasks stop after 8 seconds (initial engine loading gets 30 seconds). Worker termination restores the most recent completed snapshot. A database engine allocation failure can require reloading.
- Inline validation prepares statements against the current schema without running them. SQLite does not provide exact source ranges: squiggle positions are approximate. A batch that creates a table and then queries it may show a missing-table annotation before execution. Constraint errors and other runtime issues appear when running. This is not a full SQL language server.
- Data and history are **tab-local and disappear when the page closes or reloads**. Save the SQLite file to keep the database. Query text/history are not stored in that file.
- The app sends no uploaded rows to a server. Internet access is needed for pinned Ace, PapaParse, and sql.js assets from cdnjs and optional Google Fonts. These are third-party requests. For controlled/offline classroom deployments, download and self-host these dependencies (including sql-wasm.wasm, Ace mode/theme/autocomplete assets), update the URLs and Ace basePath, and remove the font import. No analytics are included.
- CSV exports preserve source values. Spreadsheet programs may interpret cells beginning with =, +, -, or @ as formulas; inspect untrusted exports before opening them in a spreadsheet.
- No login, shared datasets, instructor dashboard, durable cloud storage, or cross-device synchronization is included.

## Edit the branding

Change CSS variables in styles.css for colors, the header text in index.html for the wordmark, and the title / welcome text for your class. The database icon in logo.svg uses the teal and peach site colors; replace it with an approved logo if needed.

## Files

- index.html: layout, lessons, and reference guide
- styles.css: responsive visual design
- app.js: editor, UI, import/export, worker lifecycle
- db-worker.js: SQLite engine, validation, import, transactional recovery
- server.mjs: dependency-free local preview server

Library licenses: Ace (BSD), PapaParse (MIT), sql.js (MIT); SQLite is public domain. Consult their respective distributions when vendoring.
