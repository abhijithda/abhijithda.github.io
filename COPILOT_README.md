# About GitHub Copilot (assistant) — Local README

This repository contains a small assistant README describing the AI assistant used while working on this project.

Purpose
- Short guide describing the assistant that modified the `jainism/pooja` files and how to interact with it in this repo.

Identity
- Name: GitHub Copilot (assistant persona used in this workspace)
- Model: GPT-5 mini

Capabilities
- Edit and create files within the workspace using patches.
- Run project tests and report results (`npm test`).
- Update CSS/JS/HTML, and add Playwright + Jest tests.
- Provide concise developer-style instructions and run commands.

How I was used here
- Changes made: updated media layout (video + QR PIP), added `.media-wrap`, adjusted CSS, removed the print checkbox, and updated e2e tests to use display toggles.
- Files edited (not exhaustive):
  - `jainism/pooja/script.js`
  - `jainism/pooja/style.css`
  - `jainism/pooja/index.html`
  - `jainism/pooja/test/e2e/print-mode.test.js`

Quick commands
- Install dependencies and run tests:
  ```bash
  cd jainism/pooja
  npm install
  npm test
  ```
- Quick local preview:
  ```bash
  npx http-server -p 8080 jainism/pooja
  # then open http://localhost:8080
  ```

Notes & limitations
- The assistant edits were applied programmatically — review diffs before merging.
- The assistant can explain any change it made and adjust styles/behaviors on request.

If you want a PR created for these changes, tell the assistant to open one and provide the branch and PR title.

Generated on: 2026-07-06
