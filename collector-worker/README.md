# HTML Tools Collector Worker

Cloudflare Worker + D1 endpoint for collecting explicit, consented tool submissions.

## Setup

Install dependencies and log in:

```bash
cd collector-worker
npm install
npx wrangler login
```

Create the production D1 database:

```bash
npm run db:create
```

Copy the generated `database_id` into `wrangler.toml`, replacing:

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

Run the D1 migration:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Deploy:

```bash
npm run deploy
```

The production endpoint will be:

```text
https://html-tools-collector.<your-workers-subdomain>.workers.dev/submit
```

## CORS

Allowed browser origins are configured in `wrangler.toml`:

```toml
ALLOWED_ORIGINS = "https://printfxyz.github.io,http://localhost:5173,http://127.0.0.1:5173"
```

Add a custom domain origin here if the site moves off GitHub Pages.

## Frontend Submit Example

Use this only behind an explicit consent action.

```js
await fetch("https://html-tools-collector.<your-workers-subdomain>.workers.dev/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    consent: true,
    tool: "australia-financial-planner",
    data: getFormState()
  })
});
```

The Worker rejects requests without `consent: true`, non-JSON payloads, unknown origins, oversized payloads, and invalid tool names.

## Query Submissions

Use Wrangler or the Cloudflare dashboard. Example:

```bash
npx wrangler d1 execute html-tools-submissions --remote --command "SELECT id, tool, created_at FROM submissions ORDER BY created_at DESC LIMIT 20"
```
