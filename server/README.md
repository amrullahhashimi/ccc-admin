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
