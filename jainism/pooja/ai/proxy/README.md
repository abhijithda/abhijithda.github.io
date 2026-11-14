# Cloud engine proxy

A Cloudflare Worker between the site and the Anthropic API. The browser never sees the API key, and the
limits below stop anyone who finds the URL from running up your bill.

## What protects your bill (four layers)

| Layer | Where | Behaviour |
|---|---|---|
| Origin + size checks | `worker.js` | Only `ALLOWED_ORIGINS` (`https://abhijithda.github.io`). Casual-misuse filter only: a script can fake the header. |
| Per-minute rate limits | Cloudflare binding (`wrangler.toml`) | 5 questions/min per visitor IP, 40/min for the whole site. Approximate by design (per location). |
| **Exact daily budget** | Durable Object `Budget` | Per day (UTC): 300 questions, 40 per visitor, 2M input tokens, 200k output tokens. Counted from the API's own `usage`. Fails closed. |
| **Spend limit** | Anthropic Console (you set it) | The one cap that holds even if the code is wrong. |

Edit the numbers in `wrangler.toml`, then redeploy. When a daily cap is hit, readers see a plain
"limit for today" message and the book's search and Local mode keep working.

## Deploy

1. **Spend limit first.** Console -> create a new workspace (e.g. `pooja-site`; the Default workspace can't
   have its own limit) -> its **Spend limits** tab -> set a monthly cap you're happy to lose. Optionally add
   a notification threshold under Organization settings -> Billing. Create the API key *inside that workspace*.
2. **Cloudflare:** a free account is enough. Create an API token from the "Edit Cloudflare Workers" template;
   note your Account ID (Workers & Pages overview).
3. **GitHub:** repo Settings -> Secrets and variables -> Actions -> add `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`.
4. **Run** Actions -> *Deploy AI proxy* -> Run workflow. The log prints the Worker URL
   (`https://pooja-ai-proxy.<your-subdomain>.workers.dev`).
5. Paste that URL into `CLOUD_ENDPOINT` in `ai/config.js`, commit, push. Settings -> AI assistant -> Cloud
   now works.

Without GitHub Actions: from this folder, `npx wrangler@4 deploy`, then `npx wrangler@4 secret put ANTHROPIC_API_KEY`.

## Check it

- `npx wrangler@4 tail` shows refusals and upstream errors live (never the key or the question text).
- Test the limits: ask more than 5 questions in a minute -> "Too many questions right now".
- Local trial: `npx wrangler@4 dev --var ANTHROPIC_API_KEY:... --var ALLOWED_ORIGINS:http://localhost:8080`.
- `npx jest ai/proxy` covers every limit, including failing closed.

## Know the limits of the limits

- The daily token caps are enforced from usage reported *after* an answer, so a burst of simultaneous questions
  can overshoot by a few answers (each at most 800 output tokens). The Console spend limit is the backstop.
- The Worker URL is public; anyone can *try* it. They get refused, not billed, once a limit is reached.
- Caps are in tokens, not dollars, so they don't go stale when prices change, but you must translate: check the
  model's current pricing and work out what a fully used day costs.
