# Excalidraw GPT Plugin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Excalidraw MCP stack as a portable Agent Plugins package and make its existing stdio MCP surface safer and easier for ChatGPT to use through Secure MCP Tunnel, without changing the canvas runtime architecture.

**Architecture:** Keep `src/server.ts`, `frontend/src/App.tsx`, REST, WebSocket, and scene logic untouched. Add portable `plugin.json` / `mcp.json`, add concise MCP server instructions, attach safety annotations to the existing 26 tools, and document the separate ChatGPT Web tunnel registration flow. Reuse the existing `skills/excalidraw-skill/SKILL.md`; do not add a duplicate GPT-only skill.

**Tech Stack:** Node.js >=20, TypeScript 5.8, React 18, Express, WebSocket, `@modelcontextprotocol/server` 2.0.0, Agent Plugins 1.0 portable manifests, OpenAI Secure MCP Tunnel.

**Spec:** `docs/superpowers/specs/2026-09-23-excalidraw-gpt-plugin-design.md`

## Global Constraints

- Keep the local canvas bound to `127.0.0.1:3000`; do not expose the REST API publicly.
- Do not add Streamable HTTP for this MVP; use the existing stdio MCP server.
- Do not modify `src/server.ts` or `frontend/src/App.tsx`.
- Do not add or commit API keys, tunnel IDs, or `plugin_asdk_app...` identifiers.
- Preserve all existing MCP tool names, schemas, dispatch behavior, CLI behavior, and protocol-era compatibility.
- Use Agent Plugins schema version `1.0.0` for both `plugin.json` and `mcp.json`.
- Reuse `skills/excalidraw-skill/SKILL.md` unchanged.
- Keep GPT-specific changes removable without changing the original canvas runtime architecture.

## Review Focus

- **Portable stdio launch safety:** `mcp.json` must use `command: "node"`, a separate `args` array, `${PLUGIN_ROOT}`-contained paths, and no shell command string.
- **Metadata reaches clients:** `tools/list` must expose annotations on every existing tool, and initialization must expose the server instructions without breaking either MCP protocol era.
- **Conservative destructive classification:** deletion, full clear, restore, and replace-capable import must be marked destructive; external Excalidraw sharing must be marked open-world.
- **No false public-security assumption:** setup docs must keep port 3000 private and route ChatGPT through Secure MCP Tunnel only.
- **Browser-dependent operations:** setup docs and manual verification must state that screenshots/image export need an open browser canvas.

---

### Task 1: Advertise GPT-safe MCP instructions and tool annotations

**Files:**
- Modify: `scripts/check-mcp-stdio.mjs`
- Modify: `src/core/mcp-tools.ts`
- Modify: `src/core/mcp-server.ts`

**Interfaces:**
- Consumes: existing exported `tools: Tool[]` from `src/core/mcp-tools.ts`; existing `createExcalidrawMcpServer()` factory.
- Produces: the same 26 MCP tools with unchanged names/schemas/handlers plus `annotations`; `initialize` exposes concise server instructions.

- [ ] **Step 1: Extend the stdio wire test first so metadata is required**

In `scripts/check-mcp-stdio.mjs`, add these helpers near the existing assertion helpers:

```js
function toolByName(tools, name) {
  const tool = tools.find(candidate => candidate.name === name);
  assert(tool !== undefined, `tools/list: missing ${name}`);
  return tool;
}

function assertToolAnnotations(tool, expected) {
  assert(tool.annotations !== undefined, `${tool.name}: missing annotations`);
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(tool.annotations[key], value, `${tool.name}: annotations.${key}`);
  }
}
```

Inside `checkDirectCallWithoutInitialization()`, immediately after verifying the tool list is non-empty, assert that every discovered tool has an annotation object and pin representative risk classes:

```js
for (const tool of listResult.tools) {
  assert(tool.annotations !== undefined, `${tool.name}: expected annotations`);
}

assertToolAnnotations(toolByName(listResult.tools, 'describe_scene'), {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
});

assertToolAnnotations(toolByName(listResult.tools, 'create_element'), {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
});

assertToolAnnotations(toolByName(listResult.tools, 'clear_canvas'), {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
});

assertToolAnnotations(toolByName(listResult.tools, 'import_scene'), {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
});

assertToolAnnotations(toolByName(listResult.tools, 'export_to_excalidraw_url'), {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
});
```

Inside `checkLegacyInitialize()`, after checking `serverInfo.name`, require the guidance to be present:

```js
assert(
  typeof initResult.instructions === 'string' &&
    initResult.instructions.includes('describe_scene') &&
    initResult.instructions.includes('clear_canvas'),
  'initialize: expected Excalidraw operating instructions'
);
```

- [ ] **Step 2: Run the wire test and verify it fails for the new requirements**

Run:

```powershell
npm run build:server
node scripts/check-mcp-stdio.mjs
```

Expected: existing protocol checks reach `tools/list`, then FAIL because current tools have no `annotations` and/or `initialize` has no operating `instructions`.

- [ ] **Step 3: Add a complete annotation map in `src/core/mcp-tools.ts`**

Keep all existing tool definitions intact. Rename the existing array from `tools` to `toolDefinitions`, then add this mapping above it:

```ts
type ToolAnnotations = NonNullable<Tool['annotations']>;

const LOCAL_READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const LOCAL_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};

const LOCAL_DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};

const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  create_element: LOCAL_WRITE,
  update_element: LOCAL_WRITE,
  delete_element: LOCAL_DESTRUCTIVE,
  query_elements: LOCAL_READ,
  get_resource: LOCAL_READ,
  group_elements: LOCAL_WRITE,
  ungroup_elements: LOCAL_WRITE,
  align_elements: LOCAL_WRITE,
  distribute_elements: LOCAL_WRITE,
  lock_elements: LOCAL_WRITE,
  unlock_elements: LOCAL_WRITE,
  create_from_mermaid: LOCAL_WRITE,
  batch_create_elements: LOCAL_WRITE,
  get_element: LOCAL_READ,
  clear_canvas: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  },
  export_scene: LOCAL_WRITE,
  import_scene: LOCAL_DESTRUCTIVE,
  export_to_image: LOCAL_WRITE,
  duplicate_elements: LOCAL_WRITE,
  snapshot_scene: LOCAL_WRITE,
  restore_snapshot: LOCAL_DESTRUCTIVE,
  describe_scene: LOCAL_READ,
  get_canvas_screenshot: LOCAL_READ,
  read_diagram_guide: LOCAL_READ,
  export_to_excalidraw_url: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  set_viewport: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};
```

At the bottom, export a mapped array and fail fast if a future upstream tool is added without classification:

```ts
export const tools: Tool[] = toolDefinitions.map(tool => {
  const annotations = TOOL_ANNOTATIONS[tool.name];
  if (!annotations) {
    throw new Error(`Missing MCP safety annotations for tool: ${tool.name}`);
  }
  return { ...tool, annotations };
});
```

This deliberately treats file-writing export tools as writes, even though they can also be called without a path.

- [ ] **Step 4: Forward annotations and add server instructions in `src/core/mcp-server.ts`**

Add this constant near the existing server metadata constants:

```ts
const SERVER_INSTRUCTIONS = [
  'Inspect the current canvas with describe_scene before non-trivial edits.',
  'Prefer batch_create_elements when creating multiple related elements.',
  'After significant visual changes, verify the result with get_canvas_screenshot when the browser canvas is open.',
  'Preserve existing canvas content unless the user asks to replace it.',
  'Only call clear_canvas when the user explicitly asks to wipe the entire canvas.'
].join(' ');
```

Add `instructions: SERVER_INSTRUCTIONS` to the `McpServer` options object.

When registering each tool, pass through annotations from the authoritative tool table:

```ts
server.registerTool(
  tool.name,
  {
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    ...(tool.annotations !== undefined ? { annotations: tool.annotations } : {}),
    inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType)
  },
  async (args: Record<string, unknown>) => callExcalidrawTool(tool.name, args)
);
```

Do not change handlers, schemas, dispatch, cache hints, or protocol-era behavior.

- [ ] **Step 5: Run typecheck and MCP wire tests**

Run:

```powershell
npm run type-check
npm run test:mcp
```

Expected: PASS. The existing five wire checks still pass, with the new annotation and instruction assertions included.

- [ ] **Step 6: Commit the metadata change**

```powershell
git add src/core/mcp-tools.ts src/core/mcp-server.ts scripts/check-mcp-stdio.mjs
git commit -m "feat: add GPT-safe MCP metadata"
```

---

### Task 2: Add portable Agent Plugins manifests and a hermetic package contract check

**Files:**
- Create: `plugin.json`
- Create: `mcp.json`
- Create: `scripts/check-plugin-package.mjs`
- Modify: `package.json`
- Test: `scripts/check-plugin-package.mjs`

**Interfaces:**
- Consumes: built stdio entry point `dist/index.js`; existing skill `skills/excalidraw-skill/SKILL.md`.
- Produces: Agent Plugins 1.0 portable package metadata discoverable from repository root; `npm run test:plugin` contract check.

- [ ] **Step 1: Add the failing package contract test before the manifests exist**

Create `scripts/check-plugin-package.mjs` with this implementation:

```js
#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const ALLOWED_PLUGIN_KEYS = new Set([
  '$schema', 'name', 'version', 'description', 'author', 'homepage',
  'repository', 'license', 'keywords', 'extensions'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(relativePath) {
  const text = await readFile(join(repoRoot, relativePath), 'utf8');
  return JSON.parse(text);
}

async function assertFile(relativePath) {
  await access(join(repoRoot, relativePath), constants.R_OK);
}

const plugin = await readJson('plugin.json');
const mcp = await readJson('mcp.json');

assert(plugin.$schema === PLUGIN_SCHEMA, 'plugin.json: unexpected $schema');
assert(plugin.name === 'excalidraw-gpt-plugin', 'plugin.json: unexpected name');
assert(PLUGIN_NAME_PATTERN.test(plugin.name), 'plugin.json: name violates Agent Plugins naming rules');
assert(Object.keys(plugin).every(key => ALLOWED_PLUGIN_KEYS.has(key)), 'plugin.json: unsupported root field');
assert(plugin.extensions?.['com.openai']?.interface?.capabilities?.includes('Read'), 'plugin.json: Read capability missing');
assert(plugin.extensions?.['com.openai']?.interface?.capabilities?.includes('Write'), 'plugin.json: Write capability missing');

assert(mcp.$schema === MCP_SCHEMA, 'mcp.json: unexpected $schema');
assert(Object.keys(mcp).every(key => key === '$schema' || key === 'mcpServers'), 'mcp.json: unsupported root field');

const server = mcp.mcpServers?.excalidraw;
assert(server && typeof server === 'object', 'mcp.json: mcpServers.excalidraw missing');
assert(server.type === 'stdio', 'mcp.json: excalidraw must use stdio');
assert(server.command === 'node', 'mcp.json: command must be bare executable token node');
assert(Array.isArray(server.args) && server.args.length === 1, 'mcp.json: expected exactly one stdio arg');
assert(server.args[0] === '${PLUGIN_ROOT}/dist/index.js', 'mcp.json: stdio arg must target bundled dist/index.js');
assert(server.cwd === '${PLUGIN_ROOT}', 'mcp.json: cwd must stay at plugin root');
assert(!('url' in server), 'mcp.json: stdio entry must not contain a remote URL');

await assertFile('skills/excalidraw-skill/SKILL.md');
await assertFile('dist/index.js');

console.log('Portable Agent Plugins package checks passed.');
```

- [ ] **Step 2: Add `test:plugin` to `package.json` and make the aggregate test run it**

Change scripts to:

```json
{
  "test": "npm run test:mcp && npm run test:bind && npm run test:plugin",
  "test:plugin": "npm run build:server && node scripts/check-plugin-package.mjs"
}
```

Keep every existing script unchanged except the `test` composition and new `test:plugin` entry.

- [ ] **Step 3: Run the new test and verify it fails because manifests do not exist**

Run:

```powershell
npm run test:plugin
```

Expected: FAIL with an `ENOENT` for `plugin.json` or `mcp.json`.

- [ ] **Step 4: Create root `plugin.json`**

Use exactly this portable manifest:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "excalidraw-gpt-plugin",
  "version": "0.1.0",
  "description": "Create, inspect, edit, and refine diagrams on a live local Excalidraw canvas through MCP.",
  "author": {
    "name": "onsra520",
    "url": "https://github.com/onsra520"
  },
  "homepage": "https://github.com/onsra520/excalidraw-gpt-plugin",
  "repository": "https://github.com/onsra520/excalidraw-gpt-plugin",
  "license": "MIT",
  "keywords": ["excalidraw", "mcp", "diagram", "canvas", "chatgpt"],
  "extensions": {
    "com.openai": {
      "interface": {
        "displayName": "Excalidraw GPT",
        "shortDescription": "Create and edit a live Excalidraw canvas",
        "longDescription": "Create, inspect, edit, and refine diagrams on a live local Excalidraw canvas through MCP.",
        "developerName": "onsra520",
        "category": "Productivity",
        "capabilities": ["Read", "Write"],
        "websiteURL": "https://github.com/onsra520/excalidraw-gpt-plugin",
        "defaultPrompt": [
          "Create a clear architecture diagram on my Excalidraw canvas.",
          "Inspect my current Excalidraw canvas and improve the diagram."
        ]
      }
    }
  }
}
```

Do not add an `apps` field because a registered ChatGPT tunnel app ID is workspace-specific and intentionally not committed.

- [ ] **Step 5: Create root `mcp.json`**

Use exactly:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "excalidraw": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/dist/index.js"],
      "cwd": "${PLUGIN_ROOT}"
    }
  }
}
```

Do not add secrets or machine-specific absolute paths.

- [ ] **Step 6: Run the package and aggregate tests**

Run:

```powershell
npm run test:plugin
npm test
```

Expected: PASS. The package contract finds both manifests, the upstream skill, and the built MCP entry point.

- [ ] **Step 7: Commit portable packaging**

```powershell
git add plugin.json mcp.json scripts/check-plugin-package.mjs package.json
git commit -m "feat: package Excalidraw as portable plugin"
```

---

### Task 3: Document local verification and Secure MCP Tunnel connection

**Files:**
- Create: `docs/gpt-plugin-setup.md`

**Interfaces:**
- Consumes: `npm run build`, `npm test`, `dist/index.js`, local canvas `http://127.0.0.1:3000`, OpenAI `tunnel-client`.
- Produces: a copy/paste setup path for local testing and ChatGPT developer-mode connection without public REST exposure.

- [ ] **Step 1: Create `docs/gpt-plugin-setup.md` with the exact workflow below**

The document must contain these sections and commands:

```markdown
# Excalidraw GPT Plugin Setup

## 1. Build and verify locally

```powershell
npm ci
npm run build
npm test
```

Open the local canvas in one terminal:

```powershell
npm run canvas
```

Then open `http://127.0.0.1:3000` in a browser. Keep the browser tab open for screenshots and image export.

## 2. Inspect the stdio MCP server

```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

Verify `describe_scene`, `batch_create_elements`, `update_element`, `delete_element`, and `get_canvas_screenshot`.

## 3. Connect through OpenAI Secure MCP Tunnel

Create a tunnel in OpenAI Platform tunnel settings and associate it with the target Platform organization and ChatGPT workspace.

Initialize a local stdio profile using an absolute path to this repository's built entry point:

```powershell
$env:CONTROL_PLANE_API_KEY = "<runtime-api-key>"
tunnel-client init `
  --sample sample_mcp_stdio_local `
  --profile excalidraw-local `
  --tunnel-id "<tunnel-id>" `
  --mcp-command "node C:\absolute\path\to\excalidraw-gpt-plugin\dist\index.js"

tunnel-client doctor --profile excalidraw-local --explain
tunnel-client run --profile excalidraw-local
```

Keep `tunnel-client run` healthy while ChatGPT uses the app.

## 4. Create the ChatGPT developer-mode app

1. Enable Developer mode in ChatGPT if the target workspace allows it.
2. Open ChatGPT Plugins and select the plus button.
3. Choose **Tunnel** under Connection.
4. Select the associated tunnel or enter its tunnel ID.
5. Review the discovered tools and create the app.
6. Test read operations first, then create/update/delete operations if the workspace supports MCP writes.

The ChatGPT tunnel app is a registered workspace connection. The repository's root `mcp.json` is the portable local package definition; ChatGPT Web does not execute that local stdio declaration directly.

## 5. Security boundaries

- Keep the canvas server bound to `127.0.0.1`.
- Do not port-forward or tunnel `http://127.0.0.1:3000` directly to the internet.
- Do not commit `CONTROL_PLANE_API_KEY`, tunnel IDs, or workspace-specific `plugin_asdk_app...` IDs.
- Secure MCP Tunnel is the remote bridge for this MVP.
- Public plugin submission is out of scope and would require a stable public HTTPS Streamable HTTP MCP endpoint.

## 6. Common failures

- `dist/index.js` missing: run `npm run build`.
- `node` not found: install Node.js >=20 and ensure it is on PATH.
- Port 3000 occupied by another service: stop the conflicting process before starting the canvas.
- Screenshot/image export fails: make sure the browser canvas is open and connected.
- Tunnel is not visible in ChatGPT: verify workspace association and Tunnel Read/Use permissions.
- Write tools are unavailable or blocked: verify the target ChatGPT workspace's current MCP/developer-mode entitlement and approval policy.
```

Use literal placeholders exactly as shown; do not substitute real keys, tunnel IDs, or machine paths.

- [ ] **Step 2: Validate the documented local commands against the repository**

Run:

```powershell
npm run build
npm test
```

Then verify the documented entry point exists:

```powershell
Test-Path .\dist\index.js
```

Expected: `True`.

- [ ] **Step 3: Verify the documentation contains no committed credentials or workspace IDs**

Run:

```powershell
git grep -n -E "sk-[A-Za-z0-9]{20,}|plugin_asdk_app_[A-Za-z0-9]{8,}|tunnel_[A-Za-z0-9]{16,}" -- docs/gpt-plugin-setup.md plugin.json mcp.json
```

Expected: no matches.

- [ ] **Step 4: Commit the setup guide**

```powershell
git add docs/gpt-plugin-setup.md
git commit -m "docs: add ChatGPT tunnel setup guide"
```

---

### Task 4: Full branch verification and live-canvas smoke test

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all artifacts from Tasks 1-3.
- Produces: evidence that upstream behavior remains green and the MCP tool path still drives the live canvas.

- [ ] **Step 1: Install from lockfile and run all automated checks from a clean dependency state**

Run:

```powershell
npm ci
npm run build
npm run type-check
npm test
npm run type-check:frontend
```

Expected: every command exits 0.

- [ ] **Step 2: Start the local canvas and open it in the browser**

Run in terminal A:

```powershell
npm run canvas
```

Open `http://127.0.0.1:3000`. Expected: canvas loads and reports connected state.

- [ ] **Step 3: Start MCP Inspector against the existing stdio entry point**

Run in terminal B:

```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

Expected: Inspector discovers all 26 tools; the tool metadata includes annotations.

- [ ] **Step 4: Smoke-test the live read/write loop in Inspector**

Call in this order:

1. `describe_scene` with `{}`.
2. `batch_create_elements` with:

```json
{
  "elements": [
    {"id":"gpt-smoke-a","type":"rectangle","x":100,"y":100,"width":180,"height":70,"text":"GPT Web"},
    {"id":"gpt-smoke-b","type":"rectangle","x":420,"y":100,"width":180,"height":70,"text":"Excalidraw"},
    {"type":"arrow","x":0,"y":0,"startElementId":"gpt-smoke-a","endElementId":"gpt-smoke-b"}
  ]
}
```

3. `update_element` with:

```json
{"id":"gpt-smoke-b","text":"Live Excalidraw","backgroundColor":"#e7f5ff"}
```

4. `get_canvas_screenshot` with `{ "background": true }`.
5. `delete_element` for `gpt-smoke-a`.
6. `delete_element` for `gpt-smoke-b`.

Expected: browser updates live after create/update/delete, screenshot returns an image, and no direct public endpoint is involved.

- [ ] **Step 5: Verify branch scope against upstream**

Run:

```powershell
git diff upstream/main...HEAD -- src/server.ts frontend/src/App.tsx
```

Expected: no diff.

Then inspect the total changed-file list:

```powershell
git diff --name-status upstream/main...HEAD
```

Expected changes are limited to:

```text
plugin.json
mcp.json
src/core/mcp-server.ts
src/core/mcp-tools.ts
scripts/check-mcp-stdio.mjs
scripts/check-plugin-package.mjs
package.json
docs/gpt-plugin-setup.md
docs/superpowers/specs/2026-09-23-excalidraw-gpt-plugin-design.md
docs/superpowers/plans/2026-09-23-excalidraw-gpt-plugin-implementation.md
```

- [ ] **Step 6: Record verification commit only if verification required a tracked fix**

If no tracked files changed during verification, do not create an empty commit. If a test exposed a defect, fix it using TDD, rerun the full verification set above, and commit only that verified correction with a precise `fix:` message.
