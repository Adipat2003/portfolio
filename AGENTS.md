# Repository instructions

Personal portfolio site for Aditya Patel. Two facades over one content model:
Facade 1 (The Dispatch, classic scroll, default) and Facade 2 (The Atlas, the
explorable Chicago world, enhancement only).

These instructions are for AI agents and humans working in this repository.
Global machine-wide defaults in `~/.codex/AGENTS.md` apply wherever this file is
silent.

## Hard rules

- **Portfolio first.** The Dispatch is the primary surface. The Atlas never holds
  information the Dispatch does not. If a fact only exists in the world view, it
  is a bug.
- **Content safety.** No employer-internal app, repository, team, or issue names
  in any public-facing file. Figure every claim from its source document and
  keep its hedging: a projection is labeled a projection, a self-reported number
  is labeled self-reported. Nothing gets upgraded in the copy.
- **One content model, two renderers.** Project records live in data (Markdown
  or typed records), not hand-written twice into two facades.
- **No em dashes** in new user-facing strings, labels, comments, docs, or
  messages. Colons, semicolons, parentheses, or separate sentences instead.
- **No dependency additions or upgrades** without Aditya's explicit approval.
- **No secrets.** API keys live server-side only. Nothing secret-bearing enters
  a commit, a preview, or a response body.
- **Authorship.** Aditya Patel is the author of record. A `Co-authored-by`
  trailer is the only place an AI is credited.

## Artwork

- Landmarks are authored SVG, one building per file, with the source building
  named in a comment. Generated imagery and stock imagery are not used.
- Routes and stations render from data, so the map stays diffable source.
- Route and station labels carry a dark halo (`paint-order:stroke`); essential
  text never lives only inside artwork.

## Verification before done

- DOM checks are not enough. Open the render and look at it: facade switch,
  labels, contrast, proportions, mobile width.
- Full-page `capture_screenshot()` can wedge the CDP daemon. Use a viewport-only
  `cdp('Page.captureScreenshot', format='jpeg', quality=88)` capture instead and
  create the destination directory first.
- Check accessibility paths: keyboard, visible focus, reduced motion, and the
  no-JavaScript static view.
- GitHub Pages is the production renderer for this repo. `main` root is the
  Pages source. Verify the live URL after any push that changes the site.

## Workflow

- `main` is protected in spirit: no direct pushes of site changes. Branch, open
  a PR, verify the Pages preview logic locally, then merge.
- Small, scoped commits. Scan the staged diff for secrets before every commit.
- Track roadmap work as GitHub issues, one per deliverable.
