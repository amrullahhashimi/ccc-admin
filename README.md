# CCC Admin

Admin dashboard for **Canadian Cellular Communication (CCC)** — internal panel for managing store operations, inventory, and online store data.

Built on the [TailAdmin](https://tailadmin.com/) React + Tailwind CSS template.

## Tech Stack

- **React** + **TypeScript**
- **Vite** (build tooling / dev server)
- **Tailwind CSS** (styling)

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (ships with Node)

## Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/amrullahhashimi/ccc-admin.git
cd ccc-admin
npm install
```

Copy the example environment file and fill in your own values:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (Vite's default).

## Environment Variables

Create a `.env` file in the project root. Do **not** commit this file — it is ignored by `.gitignore`.

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of the backend API |
| `VITE_...` | _Add other keys your app uses_ |

> Note: With Vite, only variables prefixed with `VITE_` are exposed to the frontend.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Build the app for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run the linter _(if configured)_ |

## Project Structure

```
ccc-admin/
├── public/          # Static assets
├── src/
│   ├── components/   # Reusable UI components
│   ├── pages/        # Page views
│   ├── layout/       # Layout components
│   └── ...
├── .env.example      # Example environment variables
├── .gitignore
└── package.json
```

## Deployment

Build the production bundle and deploy the contents of the `dist/` folder to your host:

```bash
npm run build
```

## License

Private — internal use for Canadian Cellular Communication. Based on the TailAdmin template (MIT licensed).
