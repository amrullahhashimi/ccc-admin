# CCC Admin — server

The API and database behind the CCC Admin dashboard. Express + Prisma + MySQL.

Lives at `ccc-admin/server`. The React UI is the parent folder and reaches this
through Vite's `/api` proxy on port 5000.

## Setup

**1. Create the database** (MySQL Workbench, phpMyAdmin, or the CLI):

```sql
CREATE DATABASE ccc_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**2. Configure**

```bash
cp .env.example .env
```

Edit `.env` — the MySQL password and your owner login:

```
DATABASE_URL="mysql://root:yourpassword@localhost:3306/ccc_admin"
SESSION_SECRET=any-long-random-string
OWNER_NAME=Amrullah
OWNER_EMAIL=owner@caceco.ca
OWNER_PASSWORD=pick-a-real-password
PORT=5000
```

**3. Install and build the tables**

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

The seed creates your owner account, the Glendale and Chinatown locations, and a
starter set of categories. Safe to run again — it skips what already exists.

**4. Run**

```bash
npm start
```

`http://localhost:5000` should answer with a small JSON status.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | email + password |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | current user |
| POST | `/api/auth/password` | change your own |
| GET/POST | `/api/products` | list / create |
| GET/PATCH/DELETE | `/api/products/:id` | delete archives, keeps history |
| GET/POST | `/api/customers` | |
| GET/PATCH/DELETE | `/api/customers/:id` | |
| GET | `/api/meta` | categories, suppliers, locations |
| GET/POST | `/api/meta/users` | staff — owner/manager only |
| PATCH | `/api/meta/users/:id` | owner only |

Everything except login needs a session cookie.

## Vendor pricing

`/api/sourcing` — the buying side: what each vendor is asking, and who is
cheapest at the quantity you actually intend to order. It shares the `Vendor`
table with inventory, and nothing else: the catalogue here (`CatalogProduct`) is
things vendors sell, not stock the shop owns.

| Method | Path | What |
|---|---|---|
| GET | `/api/sourcing/options` | filter lists, drawn from the data that exists |
| GET | `/api/sourcing/dashboard` | totals, best deals, recent price movement |
| GET | `/api/sourcing/vendors` | vendors with offer counts and last message |
| POST | `/api/sourcing/parse` | read a message — **writes nothing** |
| POST | `/api/sourcing/import` | save the reviewed rows, in one transaction |
| GET | `/api/sourcing/products` | the catalogue, filtered and sorted |
| GET/PATCH/DELETE | `/api/sourcing/products/:id` | one product, its offers and history |
| PATCH/DELETE | `/api/sourcing/offers/:id` | correct or drop one vendor's price |
| GET | `/api/sourcing/comparison` | the grid, at `?quantity=`, `?messageId=`, `?multiVendor=1` |
| GET | `/api/sourcing/messages`, `/messages/:id` | import history and the raw text |
| DELETE | `/api/sourcing/messages/:id` | undo an import — see below |
| GET | `/api/sourcing/price-history` | every recorded change |
| GET | `/api/sourcing/products/:id/online` | what it sells for online (`?refresh=1` to re-search) |
| GET | `/api/sourcing/export/offers`, `/export/comparison` | CSV, opens in Excel |

Deleting a product, an offer or an import needs owner or manager; everything
else needs only a session.

### Undoing an import

`DELETE /messages/:id` removes the message *and the offers that came from it*,
then clears away any catalogue product left with no prices at all. Anything
less would not be an undo — it would just hide where the prices came from. A
product another vendor still quotes survives, and price history is kept.

The comparison can be narrowed to one import (`?messageId=`), which is what the
import screen does after saving: the reason to read a vendor message is to see
it against everyone else's prices.

### How the same product is recognised

`src/sourcing/normalize.js` reduces a line to a **match key** — brand, model,
generation, storage, RAM, connectivity, carrier, condition, grade and CPU, in
house spelling. Same key means same product. Different key is *never* merged on
its own; `match.js` scores the similarity, and any disagreement on one of those
attributes caps the score below the auto-accept line so a person has to decide.

That is the whole safety argument: "iPad 8 WiFi 32GB" and "iPad 8 WiFi+Cellular
32GB" look almost identical and cost different money. Colour is deliberately
outside the key — vendors leave it off constantly.

### Quantity tiers

A vendor can quote the same product at several minimum quantities. The tier is
identified by where it starts (`minQuantity`), so re-sending "10 or more"
updates that tier and writes an `OfferPriceHistory` row rather than piling up
duplicates. `maxQuantity` null means "and up".

Comparison always happens *at a quantity*: each vendor is asked what they would
charge for that many, and a vendor with no tier covering it is left out rather
than compared on a price they never offered.

### Reading messages

`src/sourcing/parse.js` is rules-based and needs no configuration. It handles
missing dollar signs, "Each", quantity-rebate headings that apply to the lines
beneath them, `wifi+cell`, `Grade A`, RAM vs storage on laptops, and one-letter
model typos. It will not guess: a line with no condition stores null, and a bare
number that looks like part of a model name never becomes a price.

Wholesale lists often arrive as a pasted spreadsheet rather than prose:

```
Device                 Condition  Carrier            In Stock  Wholesale Sell Price
Apple iPad 5 128GB     Good       Wi-Fi              4         $150.00
```

Those are read as columns, not sentences — the heading row is consumed rather
than turned into a product, and each column is authoritative: a value under
Carrier *is* the carrier (or the connectivity, when it says "Wi-Fi & Cellular"),
and a value under Condition is the grade. A table pasted without its heading row
is worked out from the shape of the data. Without this, "Good" and the stock
count end up inside the product name.

Each value goes under the heading its sender used. A column headed *Condition*
becomes the condition even when it holds "Good" or "Fair" — words that could
equally read as a cosmetic grade — and a column headed *Grade* becomes the
grade. In prose the word does the same job: "Grade A" and "Grade Good" are
grades, a bare "Good" is a condition. Nothing is translated between the two
scales; a vendor's "Good" is their own standard, and calling it somebody
else's "B" would merge stock that was never the same.

The review table gives every field its own column — product, storage,
condition, grade, price, minimum quantity, stock — so the Product box holds a
name and nothing else. The catalogue row it creates is still named in full
("Apple iPad 5 128GB WiFi Good"), which is what keeps five iPad 5s apart.

A stock count is stored as `availableQuantity` — emphatically not
`minQuantity`. Four in stock means they hold four, not that you must buy four.

`src/sourcing/ai.js` is an optional fallback for messages the rules can't read.
Off unless `SOURCING_AI_URL` and `SOURCING_AI_KEY` are set (see `.env.example`).
Its output is validated field by field against the same vocabulary and still
lands in the review table — no path from it reaches the database directly.

### Online prices

`src/sourcing/online` answers the other half of a buying decision: the vendor
quotes wholesale, this is what the thing retails for. Two tiers, in order of how
much a price can be relied on:

1. **Canadian national retail** — Best Buy Canada, read from the JSON endpoint
   their own storefront uses, and Amazon.ca, read from its search page. Both
   give a name, a price and a link.
2. **The local market** — Kijiji, read from the data the page ships with. Each
   listing carries its town, so a local asking price reads as one.

Sites that block automated reads or build prices in the browser (Walmart, eBay,
Staples, Canada Computers, Facebook Marketplace) get a ready-made search link
instead. Walmart in particular answers every automated request with a "Verify
Your Identity" challenge, and getting round that is not something this does. A
link costs one click; a scraped number nobody checked costs money.

Every path fetched is permitted by that site's robots.txt — which is why Best Buy
is read through `/api/` rather than `/en-ca/search`, the one path they disallow.

Nothing here bills per lookup, which is the standing rule for the shop tools.

Four filters keep the section honest, and each of them exists because a real
lookup got something wrong:

- the listing must name the model, with spacing differences allowed, so
  "Sonim XP 9900" finds "XP9900";
- accessories are dropped — a $13 screen protector matches a phone's name
  perfectly and would otherwise become the "cheapest online" price;
- a family qualifier the product doesn't have rules it out, because an iPad
  Mini 6 ($470) is not an iPad 6 ($130);
- and a stated capacity has to match, because a 128GB listing is not the price
  of the 32GB you are buying. A title that never says is left alone.

Results are cached against the product for 12 hours (`OnlinePrice`, replaced
wholesale on each search): the page is read all day, and none of these sites
deserve to be asked more than a couple of times.

### Tests

```bash
npm test
```

`test/sourcing.test.js` covers the parser, the matcher and the comparison,
including the messages both example vendors actually send.

## Roles

| Role | Can do |
|---|---|
| Owner | Everything, including staff accounts |
| Manager | Everything except creating staff |
| Staff | Inventory, customers, sales |
| Tech | Same as staff |

## Notes

- **Prisma is pinned to v6.** Don't run `npm install prisma@latest` — v7 removed
  `url` from the schema and needs a different setup entirely.
- Money is stored in cents. The API takes dollars (`price: 129.99`) and converts.
- Sessions live in memory, so restarting signs everyone out. Needs a session
  store before this is ever hosted, along with HTTPS and `cookie.secure = true`.
- The schema already covers tickets, sales, layaway, payments, and invoices —
  those tables just sit unused until we build those screens.
- Back up with `mysqldump ccc_admin > backup.sql`.
