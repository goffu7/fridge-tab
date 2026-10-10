# Fridge Tab

A small web app for roommates who share convenience-store food. Scan 7-Eleven receipts (several at once), tick who ate each item, and see who owes whom. Whoever is owed records what they've been paid back; borrowers can send a "paid you back" request with a slip photo that the lender accepts.

- **Frontend:** Vite, React 19, TypeScript, Tailwind CSS 4, React Router, TanStack Query, vaul (bottom sheets), sonner (toasts), lucide icons. Installable to the home screen (web manifest). Three themes (Sakura pink, VS Code, Dragon Ball), each with light and dark.
- **Backend:** Node + Express 5 + SQLite via libSQL. Invite link + PIN login with httpOnly session cookies, bcrypt-hashed PINs, rate-limited login.
- **Receipt reading:** Google Gemini (free tier) behind `server/src/ai/receipt.ts`.

## Run locally

Requires Node 22+.

```sh
npm install
cp .env.example .env        # optional: add GEMINI_API_KEY to enable scanning
npm run dev                 # API on :3001, web on http://localhost:5173
```

Open http://localhost:5173, create a house, then send the invite link from **Settings** to your roommates.

Other scripts: `npm test` (ledger tests), `npm run typecheck`, `npm run build && npm start` (production build on :3001).

## Deploy for free (Render + Turso)

Render's free web service has no persistent disk, so the database lives on Turso's free hosted SQLite.

1. **Database:** create a free account at https://turso.tech, create a database, and copy its URL (`libsql://…`) and an auth token.
2. **Gemini key:** create one at https://aistudio.google.com/apikey. On the free tier Google may use requests to improve its models; don't scan anything sensitive.
3. **Host:** push this repo to GitHub, then in Render choose **New → Blueprint** and pick the repo (it reads `render.yaml`). Fill in `DATABASE_URL`, `DATABASE_AUTH_TOKEN` and `GEMINI_API_KEY`.

The free Render service sleeps after ~15 minutes idle; the first visit after that takes about 30 seconds.

## Layout

```
client/   React app (pages/, features/, components/, lib/)
server/   Express API (routes/, ai/, db.ts, auth.ts)
shared/   Types and the ledger math used by both, with tests
prototype/  The original single-file prototype
```

Money is stored as integer satang. Balances are computed pairwise (`shared/ledger.ts`): a debt is never routed through a third person, so "B owes A" always means B ate A's food.
