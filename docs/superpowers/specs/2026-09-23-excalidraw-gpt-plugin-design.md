# Excalidraw GPT Plugin Integration Design

Date: 2026-09-23
Status: Approved for implementation
Repository: `onsra520/excalidraw-gpt-plugin`
Upstream: `yctimlin/mcp_excalidraw`

## 1. Goal

Add the thinnest practical GPT Web integration around the existing `mcp_excalidraw` stack so a supported ChatGPT workspace can read and mutate the live local Excalidraw canvas through OpenAI Secure MCP Tunnel.

The implementation reuses the existing local canvas, REST API, WebSocket synchronization, MCP tool definitions, stdio transport, and the existing upstream `skills/excalidraw-skill` workflow guidance. It must not rewrite Excalidraw scene handling or expose the local REST API directly to the public internet.

Success means:

- the existing canvas still runs locally on `127.0.0.1:3000`;
- the existing MCP stdio server remains compatible with current MCP clients;
- the repository becomes a portable Agent Plugins package with root `plugin.json` and `mcp.json`;
- the existing `skills/excalidraw-skill/SKILL.md` is reused rather than duplicated;
- the stdio MCP server can be reached from ChatGPT through Secure MCP Tunnel in a workspace that supports the required MCP capabilities;
- direct ChatGPT MCP connections receive concise server-level operating guidance and accurate tool safety annotations;
- upstream merge surface remains small.

## 2. Constraints

1. Keep the integration disposable. If the GPT-specific package/metadata changes are removed later, the upstream project should continue to work normally.
2. Do not add a Streamable HTTP MCP transport for the MVP. Secure MCP Tunnel can forward to the existing stdio MCP server.
3. Do not expose `http://127.0.0.1:3000` or its REST endpoints publicly.
4. Do not rewrite `src/server.ts`, `frontend/src/App.tsx`, scene storage, WebSocket synchronization, or the current dispatcher.
5. Reuse the existing `createExcalidrawMcpServer()` and `serveStdio()` path.
6. Preserve upstream compatibility and minimize modifications to files likely to change upstream.
7. ChatGPT write/modify MCP availability is controlled by OpenAI account/workspace entitlement and is not solved by repository code.
8. The portable package and the ChatGPT Web tunnel connection are related but distinct: ChatGPT Web connects by creating a developer-mode app with `Connection = Tunnel`; it does not execute a repository-local stdio process directly.

## 3. Non-goals

The MVP will not:

- publish the plugin to the public Plugin Directory;
- deploy a public HTTPS MCP endpoint;
- add OAuth or public-user authentication;
- replace the current Excalidraw frontend;
- redesign the existing 26 MCP tools;
- add a second scene store;
- add a GPT-specific proxy between MCP and the local canvas;
- add a duplicate GPT-only skill;
- commit workspace-specific `plugin_asdk_app...` identifiers or a live `.app.json` mapping;
- fork or modify `excalidraw/excalidraw` itself.

## 4. Existing Architecture

```text
MCP client
    |
    v
src/index.ts (stdio MCP transport)
    |
    v
src/core/mcp-server.ts
    |
    v
src/core/mcp-dispatch.ts
    |
    v
src/core/canvas-client.ts
    |
    | HTTP on loopback
    v
src/server.ts
    |                 \
    | REST             \ WebSocket
    v                   v
in-memory scene     frontend/src/App.tsx
                         |
                         v
                @excalidraw/excalidraw
```

The browser and backend already synchronize in both directions. GPT integration therefore only needs to expose the existing MCP server through the supported private transport and improve metadata/instructions so a hosted model can use it safely.

## 5. Target Architecture

```text
ChatGPT Web / Work
        |
        | developer-mode app (Connection = Tunnel)
        v
OpenAI Secure MCP Tunnel
        |
        | stdio forwarding
        v
node dist/index.js
        |
        v
existing MCP tools + server instructions + safety annotations
        |
        v
existing canvas-client
        |
        v
127.0.0.1:3000
        |
        +---- REST scene operations
        |
        +---- WebSocket live updates
                     |
                     v
              local Excalidraw UI
```

The tunnel is the remote transport boundary. The local Express server remains loopback-only.

Separately, the repository is packaged in portable Agent Plugins format for local/repo-aware clients:

```text
plugin.json
mcp.json
skills/excalidraw-skill/
```

The portable `mcp.json` declares the same stdio entry point. It does not replace the ChatGPT Web tunnel registration flow.

## 6. Plugin Package Surface

### `plugin.json`

Add a root portable Agent Plugins 1.0 manifest using:

`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`

It defines the package identity and OpenAI presentation metadata under `extensions.com.openai.interface`, including explicit `Read` and `Write` capabilities.

### `mcp.json`

Add a root portable MCP manifest using:

`https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`

Declare one stdio server:

```text
command: node
args: ["${PLUGIN_ROOT}/dist/index.js"]
cwd: "${PLUGIN_ROOT}"
```

`node` is a bare executable token, and `args`/`cwd` use only Agent Plugins-defined placeholders. No shell command string is embedded.

### Existing `skills/excalidraw-skill/SKILL.md`

Reuse the upstream skill unchanged for the MVP. It already:

- prefers MCP tools when available;
- instructs agents to inspect the scene before refinement;
- uses screenshots for visual verification;
- supports element CRUD, batch operations, import/export, snapshots, Mermaid, layout, and viewport controls;
- warns about destructive canvas clearing.

A second GPT-only skill would duplicate behavior and increase upstream merge surface, so it is intentionally omitted.

### `docs/gpt-plugin-setup.md`

Document two distinct setup paths:

1. local/portable package verification (`npm ci`, build, MCP Inspector, plugin manifest checks);
2. ChatGPT Web private connection through Secure MCP Tunnel (`tunnel-client`, tunnel association, developer-mode app with Tunnel connection).

The guide must warn that the local REST service on port 3000 is not an authenticated public API and must remain private.

## 7. MCP Metadata Changes

### Server instructions

Add concise MCP server instructions in `src/core/mcp-server.ts` so clients that connect directly to the MCP server receive guidance even when they do not load the repository skill.

The instructions must say, in substance:

- inspect the current scene with `describe_scene` before non-trivial edits;
- prefer `batch_create_elements` for multi-element creation;
- verify significant visual changes with `get_canvas_screenshot` when the browser canvas is open;
- preserve existing content unless the user asks to replace it;
- do not call `clear_canvas` unless the user explicitly requests a full wipe.

### Tool annotations

The installed MCP server SDK supports `annotations` on `registerTool`. `src/core/mcp-tools.ts` remains the authority for tool metadata, and `src/core/mcp-server.ts` forwards each tool's annotation object when registering it.

Classification is conservative:

- read-only/local: `query_elements`, `get_resource`, `get_element`, `describe_scene`, `get_canvas_screenshot`, `read_diagram_guide`;
- local mutations, non-destructive by default: creation, update, layout, group/ungroup, lock/unlock, duplicate, Mermaid conversion, viewport changes, snapshots;
- destructive: `delete_element`, `clear_canvas`, `restore_snapshot`, and `import_scene` because at least one supported mode can replace/remove current scene state;
- file-output operations such as `export_scene` and `export_to_image` are not marked read-only because they can write a caller-selected path;
- `export_to_excalidraw_url` is marked open-world because it uploads encrypted scene data to Excalidraw sharing infrastructure.

Annotations are hints only; they do not change tool execution semantics.

## 8. Data Flow

### Read flow

```text
GPT request
  -> MCP tool, e.g. describe_scene
  -> existing dispatcher
  -> canvas-client
  -> local REST API
  -> result returned through tunnel
  -> GPT response
```

### Write flow

```text
GPT request
  -> MCP write tool
  -> existing dispatcher
  -> canvas-client
  -> local REST mutation
  -> server updates scene state
  -> WebSocket broadcast
  -> browser receives event
  -> Excalidraw UI updates live
```

### Human edit flow

```text
user edits browser canvas
  -> Excalidraw onChange
  -> debounced sync to local REST API
  -> backend scene becomes authoritative for subsequent MCP reads
```

No GPT-specific scene state is created.

## 9. ChatGPT Web Connection Flow

ChatGPT Web does not launch the repository's stdio MCP process itself.

The private-development flow is:

1. build the repository;
2. create/obtain an OpenAI-hosted MCP tunnel and associate it with the target Platform organization / ChatGPT workspace;
3. run `tunnel-client` locally with `--mcp-command` pointing to `node <absolute-path>/dist/index.js`;
4. verify the tunnel with `tunnel-client doctor` and keep `tunnel-client run` healthy;
5. in ChatGPT developer mode, create a plugin/app connection and choose `Tunnel`;
6. select the tunnel or paste its `tunnel_id`;
7. review discovered MCP tools and test read/write behavior according to workspace entitlement.

A workspace-specific `plugin_asdk_app...` mapping can be added later through `.app.json` if packaging that registered connection becomes useful, but it is not committed in this disposable MVP.

## 10. Security Model

Requirements:

- `src/server.ts` remains bound to loopback by default;
- port `3000` is never forwarded directly to the public internet;
- CORS is not treated as authentication;
- the tunnel client is the only intended remote bridge during development;
- destructive MCP tools expose destructive annotations where applicable;
- `export_to_excalidraw_url` is identified as an external side effect;
- no API keys, `tunnel_id`, or workspace-specific app IDs are committed;
- public plugin submission remains out of scope because it requires a stable public HTTPS Streamable HTTP MCP endpoint and a stronger production security model.

## 11. Error Handling

The GPT layer adds no new runtime proxy or error translation. Existing MCP and canvas errors remain authoritative.

The setup guide covers:

- project not built (`dist/index.js` missing);
- Node unavailable to the portable stdio launcher;
- canvas server unavailable or the wrong service occupying port 3000;
- browser tab required for screenshot/image export;
- tunnel profile unhealthy or not associated with the target workspace;
- ChatGPT developer mode / MCP write capability unavailable;
- destructive actions requiring confirmation or being denied.

## 12. Testing Strategy

### Existing project verification

```text
npm ci
npm run build
npm test
```

Existing upstream tests must remain green.

### MCP wire verification

Extend the existing `scripts/check-mcp-stdio.mjs` checks so `tools/list` proves that representative read/write/destructive/open-world tools advertise the intended annotations and legacy initialization exposes the server instructions.

Keep the existing protocol-era tests intact.

### Plugin package verification

Add a dependency-free Node script that verifies:

- `plugin.json` and `mcp.json` are valid JSON;
- schema URLs are Agent Plugins 1.0 canonical identifiers;
- plugin name satisfies the Agent Plugins naming constraints;
- only allowed root manifest fields are used;
- `mcpServers.excalidraw` uses `type: "stdio"`;
- `command` is the bare executable token `node`;
- `args` targets `${PLUGIN_ROOT}/dist/index.js`;
- `cwd` is `${PLUGIN_ROOT}`;
- the existing skill file and built MCP entry point exist.

Wire that script into `npm test` through a dedicated `test:plugin` script.

### Manual live-canvas verification

With the browser canvas open, verify:

1. `describe_scene` reads current state;
2. `batch_create_elements` creates visible elements;
3. `update_element` changes an element;
4. `delete_element` removes it;
5. `get_canvas_screenshot` returns the rendered result.

### Tunnel verification

Use `tunnel-client doctor --profile <profile> --explain` and then create a ChatGPT developer-mode app using the tunnel. This step requires user-owned OpenAI tunnel/workspace credentials and permissions and is therefore documented rather than automated in repository tests.

## 13. Upstream Compatibility Strategy

Keep GPT-specific files additive and core edits narrowly metadata-focused.

Expected modified upstream files:

- `src/core/mcp-server.ts` — add server instructions and forward existing tool annotations;
- `src/core/mcp-tools.ts` — add annotations to the existing tool definitions;
- `scripts/check-mcp-stdio.mjs` — assert metadata on the wire;
- `package.json` — add `test:plugin` and include it in `test`.

Expected new files:

- `plugin.json`;
- `mcp.json`;
- `scripts/check-plugin-package.mjs`;
- `docs/gpt-plugin-setup.md`.

Do not change `src/server.ts` or `frontend/src/App.tsx` for this MVP.

## 14. Definition of Done

The MVP is done when:

1. root `plugin.json` and `mcp.json` conform to portable Agent Plugins 1.0 expectations;
2. the existing `skills/excalidraw-skill/SKILL.md` remains the only bundled Excalidraw operating skill;
3. the existing MCP stdio server advertises concise server instructions;
4. all 26 tools retain their current behavior and expose accurate safety annotations;
5. setup documentation explains local build, Inspector, Secure MCP Tunnel, ChatGPT developer-mode connection, entitlement limitations, and security;
6. `npm ci`, `npm run build`, and `npm test` pass;
7. MCP Inspector can read and mutate the live local canvas through the existing tool path;
8. no direct public exposure of the local REST API is required;
9. removal of the GPT-specific package files/metadata leaves the original canvas runtime architecture intact.

## 15. Deferred Work

Only consider these if the disposable MVP proves useful long enough to justify them:

- Streamable HTTP `/mcp` transport;
- committed `.app.json` or marketplace packaging for a stable registered ChatGPT app;
- OAuth or mTLS-backed public deployment;
- public Plugin Directory submission;
- tool-surface reduction or GPT-specific tool aliases;
- custom plugin UI;
- persistent auth/config management;
- deeper integration into a future Memoriae canvas.
