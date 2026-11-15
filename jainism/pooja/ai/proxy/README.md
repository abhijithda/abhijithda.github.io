# Cloud engine proxy

A Cloudflare Worker between the site and the AI model. By default it uses **Cloudflare Workers AI, which is
free** (no API key, no card). Anthropic's paid API is an optional alternative (bottom of this page).

## What protects you (four layers)

| Layer | Where | Behaviour |
|---|---|---|
| Origin + size checks | `worker.js` | Only `ALLOWED_ORIGINS` (`https://abhijithda.github.io`). A casual-misuse filter only: a script can fake the header. |
| Per-minute rate limits | Cloudflare binding (`wrangler.toml`) | 5 questions/min per visitor IP, 40/min for the whole site. Approximate by design (per location). |
| **Exact daily budget** | Durable Object `Budget` | Per day (UTC): 150 questions, 25 per visitor, 700k input and 60k output tokens. Counted from the usage the model reports. Fails closed. Sized to stay under the free allowance, so readers see "limit for today" from this site rather than a provider error. |
| **Provider's own cap** | Cloudflare | Workers AI gives 10,000 "neurons" a day free. On the **Workers Free** plan, Cloudflare itself refuses requests beyond that: there is no overage billing. (Stay on Workers Free; upgrading to Workers Paid is what would allow charges.) |

With the default model (Gemma 4 26B A4B) a typical question costs about 60 neurons, so the free allowance covers
roughly 150 questions a day. When a cap is hit, readers see a plain "limit for today" message, and the book's
search and Local mode keep working. Edit the numbers in `wrangler.toml` and redeploy.

## Deploy

1. **Cloudflare** (a free account is enough): create an API token from the "Edit Cloudflare Workers" template,
   limited to your account; note your Account ID (Workers & Pages overview).
2. **GitHub:** repo Settings -> Secrets and variables -> Actions -> add `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`. No AI key is needed.
3. **Put the workflow at the repo root.** GitHub only runs workflows from `.github/workflows/` at the very top of the
   repository (`abhijithda.github.io/.github/workflows/deploy-ai-proxy.yml`), not from inside `jainism/pooja/`. The
   workflow's `PROXY_DIR` (`jainism/pooja/ai/proxy`) says where the proxy is inside the repo; commit and push both.
4. **Run** Actions -> *Deploy AI proxy* -> Run workflow. The log prints the Worker URL
   (`https://pooja-ai-proxy.<your-subdomain>.workers.dev`).
5. Paste that URL into `CLOUD_ENDPOINT` in `ai/config.js`, commit, push. Settings -> AI assistant -> Cloud now works.

If the deploy fails mentioning the AI binding or permissions, edit the token and add a **Workers AI** permission
(Read is probably enough; Edit if it still complains). That is the first thing to check, because the default
"Edit Cloudflare Workers" template may not include it.

Without GitHub Actions: from this folder, `npx wrangler@4 deploy`.

## Check it

- **Logs:** Workers & Pages -> `pooja-ai-proxy` -> Logs (switched on in `wrangler.toml`), or `npx wrangler@4 tail`.
  They show refusals, model errors, and `empty answer ...` lines saying why a model returned nothing. Never the
  question or the book passages.
- **Usage:** Workers & Pages -> Workers AI shows neurons used today.
- Rate limit: ask more than 5 questions in a minute -> "Too many questions right now".
- `npx jest ai/proxy` covers every limit, both backends, and failing closed.

## Testing Cloud from your own computer

The Worker answers only the pages listed in `ALLOWED_ORIGINS` (`wrangler.toml`): the live site, plus
`http://127.0.0.1:3000` and `http://localhost:3000` for a local dev server on port 3000. From any other address or port
the browser blocks the request ("blocked by CORS policy" in the console) and the panel says it couldn't reach the cloud
assistant. Add the origin (scheme + host + port, no path) to `ALLOWED_ORIGINS` and **redeploy**: the list lives in the
deployed Worker, so editing the file changes nothing until the workflow has run again.

## If answers come back empty or oddly short

Gemma 4 "thinks" before answering unless told not to, and the thinking can use up the whole answer budget. The
Worker turns thinking off (`DISABLE_THINKING = "true"`), which is Cloudflare's documented switch for this model. If
you change `MODEL` to one that doesn't have that switch, set `DISABLE_THINKING = "false"`. An empty answer is never
shown as an error: the reader gets the book's matching passages instead, and the log says why.

## Know the limits of the limits

- Daily token caps are enforced from usage reported *after* an answer, so a burst of simultaneous questions can
  overshoot by a few answers (each at most 800 output tokens). The free allowance is the backstop.
- The Worker URL is public; anyone can *try* it. They get refused, not billed, once a limit is reached.
- Quality on Kannada is something to judge from real questions; the book's passages are shown verbatim beside
  every answer whatever the model writes.
- Neuron rates and the model list change. Re-check Cloudflare's Workers AI pricing page before changing `MODEL`,
  and redo the sum in `wrangler.toml` (input tokens x rate + output tokens x rate must stay under 10,000).

## Optional: Anthropic instead (paid)

Set `BACKEND = "anthropic"` and `MODEL = "claude-haiku-5-5"` in `wrangler.toml`, raise the daily caps to suit
(`2000000` input / `200000` output tokens were the earlier values), then:
1. Anthropic Console -> create a workspace with a monthly **spend limit** (the Default workspace can't have one);
   create the API key inside it. API usage is prepaid credits, so a small balance with auto-reload off is also a cap.
2. Add the key once in the Cloudflare dashboard: Workers & Pages -> `pooja-ai-proxy` -> Settings -> Variables and
   Secrets -> Add -> type **Secret**, name `ANTHROPIC_API_KEY` (or `npx wrangler@4 secret put ANTHROPIC_API_KEY`
   with a token that can edit this Worker). It stays across deploys and never touches GitHub.
