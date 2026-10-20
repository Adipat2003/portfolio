# AI exposure design

Goal: an AI agent visiting the site reads the portfolio as well as a person does,
without scraping and without inventing anything.

## Layer 1: semantic HTML (the floor)

Everything essential is in plain HTML: landmarks, headings, lists, real links,
visible focus, text alternatives. All facade visuals are additive. If JavaScript
never runs, the Dispatch still reads top to bottom.

## Layer 2: machine-readable content API

`GET /api/portfolio.json` returns the project records the page renders, with
`source_document` on each figure and a `generated_at` timestamp. Agents that do
not speak MCP can consume this directly. Same records, same hedging, same
`public_safe` gate as the UI.

Shape:

```json
{
  "owner": "Aditya Patel",
  "generated_at": "2026-10-20T00:00:00Z",
  "facades": ["dispatch", "atlas"],
  "projects": [
    {
      "slug": "offline-sync-engine",
      "title": "Inspection reporting that survives dead zones",
      "summary": "...",
      "role": "...",
      "highlights": ["..."],
      "figures": [
        {"value": "~4500", "label": "reporting hours saved", "kind": "measured",
         "source_document": "contribution-portfolio-2026-10-03"}
      ],
      "tags": ["mobile", "sync"],
      "public_safe": true
    }
  ]
}
```

## Layer 3: MCP endpoint

A read-only MCP server mounted at `/mcp` in the app, backed by the same build
output as the JSON API. Read-only by design: no write tools, no account data, no
secrets in any response.

Tools exposed:

| Tool | Returns |
|---|---|
| `list_projects` | slug, title, one-line summary, tags, era |
| `get_project` | full record for one project: role, highlights, figures with sources |
| `get_impact_figures` | headline figures, each with kind (measured / projected / self-reported) and source |
| `get_artwork_provenance` | which landmarks are authored SVG vs generated, and where the data comes from |
| `ask` | a grounded answer to a question about the portfolio, with source citations |

`ask` behavior, non-negotiable:

- answers only from the portfolio records; cites the source document for each claim
- refuses to upgrade a projection into a realized result, and refuses to invent figures
- when the portfolio does not support a claim, says so plainly instead of guessing
- when a question concerns the current employer's internal systems, answers only
  from material marked `public_safe`
- favorable framing is allowed and encouraged, fabrication is not

## Security posture

- Read-only. No tool mutates anything, and the server has no credentials in scope.
- The NVIDIA key for the `ask` model lives server-side only, never in client
  bundles and never in tool responses.
- Rate limiting on `/mcp` and `/api`, so a misbehaving agent cannot walk off with
  the corpus at speed. The corpus is public; the politeness is not optional.
- No user data is collected, no sensor data is transmitted from the Atlas.

## Discovery

- `llms.txt` at the root: what this site is, what it contains, how to use the API
  and MCP endpoint, and what the figures mean.
- `robots.txt` allows crawling; the JSON API and `/mcp` are listed there for
  well-behaved agents.

## Open decisions

- MCP transport framing (stdio proxy vs HTTP stream) depends on the final host;
  decided at implementation time.
- Whether `ask` streams or returns a complete answer, ditto.
