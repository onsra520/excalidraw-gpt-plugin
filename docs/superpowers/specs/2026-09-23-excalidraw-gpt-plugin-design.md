# Excalidraw GPT Plugin Integration Design

Date: 2026-09-23
Status: Proposed for implementation
Repository: `onsra520/excalidraw-gpt-plugin`
Upstream: `yctimlin/mcp_excalidraw`

## 1. Goal

Add the thinnest possible GPT Web integration around the existing `mcp_excalidraw` stack so a supported ChatGPT workspace can connect to the local Excalidraw MCP server through OpenAI Secure MCP Tunnel.

The implementation should reuse the existing local canvas, REST API, WebSocket synchronization, MCP tool definitions, and stdio transport. It must not rewrite Excalidraw scene handling or expose the local REST API directly to the public internet.

Success means:

- the existing canvas still runs locally on `127.0.0.1:3000`;
- the existing MCP stdio server remains compatible with current MCP clients;
- the repository can be packaged as a portable OpenAI plugin with a root `plugin.json`, root `mcp.json`, and a small skill;
- the stdio MCP server can be connected to ChatGPT through Secure MCP Tunnel in a workspace that supports the required MCP capabilities;
- GPT can discover the existing Excalidraw tools without duplicating their business logic;
- upstream merge surface remains small.

## 2. Constraints

1. Keep the integration disposable. If the GPT-specific layer is removed later, the upstream project should continue to work normally.
2. Do not add a Streamable HTTP MCP transport for the MVP. Secure MCP Tunnel can forward to an existing stdio MCP server.
3. Do not expose `http://127.0.0.1:3000` or its REST endpoints publicly.
4. Do not rewrite `src/server.ts`, `frontend/src/App.tsx`, scene storage, WebSocket synchronization, or the current MCP dispatcher unless a concrete compatibility issue requires it.
5. Reuse the existing `createExcalidrawMcpServer()` and `serveStdio()` path.
6. Preserve upstream compatibility and minimize modifications to files likely to change upstream.
7. ChatGPT write/modify MCP availability is controlled by OpenAI account/workspace entitlement and is not solved by repository code.

## 3. Non-goals

The MVP will not:

- publish the plugin to the public Plugin Directory;
- deploy a public HTTPS MCP endpoint;
- add OAuth or public-user authentication;
- replace the current Excalidraw frontend;
- redesign the existing 26 MCP tools;
- add a second scene store;
- add a GPT-specific proxy between MCP and the local canvas;
- fork or modify `excalidraw/excalidraw` itself.

## 4. Existing Architecture

The current repository already provides the required execution path:

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

The browser and backend already synchronize in both directions. GPT integration therefore only needs to make the existing MCP server discoverable and usable from ChatGPT.

## 5. Target Architecture

```text
ChatGPT Web / Work
        |
        v
Personal/custom plugin
        |
        v
OpenAI Secure MCP Tunnel
        |
        | stdio forwarding
        v
node dist/index.js
        |
        v
existing MCP tools
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

The tunnel is the transport boundary. The local Express server remains loopback-only.

## 6. New Plugin Package Surface

The repository root will become a portable plugin package by adding:

```text
plugin.json
mcp.json
skills/
  excalidraw-gpt/
    SKILL.md
docs/
  gpt-plugin-setup.md
```

### `plugin.json`

Purpose:

- define the portable plugin identity;
- provide OpenAI-facing presentation metadata under `extensions.com.openai` where appropriate;
- describe the plugin as a local Excalidraw canvas controller for development/testing.

The manifest must not claim capabilities that the current ChatGPT workspace cannot use.

### `mcp.json`

Purpose:

- declare the existing local stdio MCP server as the plugin MCP dependency;
- launch the built server with the existing entry point, expected to be equivalent to `node dist/index.js`;
- preserve environment-based canvas configuration already supported by the project.

No new MCP implementation is introduced here.

### `skills/excalidraw-gpt/SKILL.md`

Purpose:

- teach the model how to use the existing tools efficiently and safely;
- prefer reading the current scene before non-trivial edits;
- use batch operations when appropriate;
- visually verify significant diagram changes with `get_canvas_screenshot` when the browser canvas is open;
- avoid destructive operations such as `clear_canvas` unless directly required;
- use `describe_scene` as the primary semantic inspection tool;
- preserve existing content unless the user asks to replace it.

The skill must stay small and should not duplicate the large upstream Excalidraw agent skill.

### `docs/gpt-plugin-setup.md`

Purpose:

- document local build and canvas startup;
- document MCP Inspector verification;
- document Secure MCP Tunnel configuration conceptually;
- document ChatGPT developer-mode connection steps;
- state workspace/plan limitations clearly;
- warn users not to expose the local REST service publicly.

## 7. Existing Code Changes

MVP code changes should be limited to metadata improvements that help ChatGPT reason about tool safety.

### MCP tool annotations

Where supported by the installed MCP SDK, existing tool registration/definitions should mark tools according to behavior. The exact SDK field names must be verified during implementation rather than guessed.

Intended classification:

- read-only: `describe_scene`, `get_canvas_screenshot`, `get_element`, `query_elements`, `get_resource`, `read_diagram_guide`;
- mutating but normally reversible: `create_element`, `batch_create_elements`, `update_element`, `align_elements`, `distribute_elements`, `group_elements`, `ungroup_elements`, `lock_elements`, `unlock_elements`, `duplicate_elements`, `set_viewport`, `snapshot_scene`, `restore_snapshot`, `create_from_mermaid`, `import_scene`;
- destructive: `delete_element`, `clear_canvas`;
- external side effect: `export_to_excalidraw_url` uploads an encrypted scene to Excalidraw sharing infrastructure and must not be represented as a pure local read.

If the current SDK does not support the desired annotations without invasive changes, annotations are deferred rather than forcing a transport/core refactor.

## 8. Data Flow

### Read flow

```text
GPT request
  -> MCP tool, e.g. describe_scene
  -> existing dispatcher
  -> canvas-client
  -> local REST API
  -> result returned through MCP tunnel
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

## 9. Security Model

The MVP trusts the existing local process boundary and OpenAI Secure MCP Tunnel.

Requirements:

- `src/server.ts` remains bound to loopback by default;
- no port-forwarding of `3000` to the public internet;
- no public CORS exposure is treated as an authentication mechanism;
- the tunnel client is the only intended remote bridge during development;
- destructive MCP tools should retain clear descriptions and, where supported, destructive annotations so ChatGPT can apply appropriate confirmation behavior;
- public plugin submission is out of scope because it would require a stable public HTTPS Streamable HTTP MCP endpoint and a stronger production authentication model.

## 10. Error Handling

The GPT layer adds no new runtime error translation for the MVP. Existing MCP and canvas errors remain authoritative.

The setup guide must cover these common failures:

- canvas server not running or wrong service on port 3000;
- frontend browser tab required for screenshot/image export;
- MCP stdio process fails to start because the project is not built;
- Secure MCP Tunnel not healthy or not associated with the target workspace;
- ChatGPT workspace lacks required MCP/write capability;
- a destructive action is blocked or requires confirmation.

## 11. Testing Strategy

Implementation is complete only after all applicable checks pass.

### Existing project verification

```text
npm ci
npm run build
npm test
```

Existing upstream tests must remain green.

### MCP verification

Use MCP Inspector against the built stdio server and verify at least:

1. tool discovery;
2. `describe_scene` on an empty and non-empty canvas;
3. `batch_create_elements` creates visible elements;
4. `update_element` changes an existing element;
5. `delete_element` removes an element;
6. `get_canvas_screenshot` succeeds when a browser canvas is open;
7. failures are sensible when the canvas is unavailable.

### Plugin package verification

- `plugin.json` parses against the current portable plugin schema;
- `mcp.json` resolves the existing stdio command;
- the skill is discovered from `skills/excalidraw-gpt/SKILL.md`;
- Secure MCP Tunnel can start the stdio server or forward to it without requiring changes to the local canvas service;
- ChatGPT connection testing is performed only in a workspace that exposes the relevant developer-mode MCP capability.

## 12. Upstream Compatibility Strategy

Keep GPT-specific files additive wherever possible.

Preferred upstream sync pattern:

```text
upstream/main
    -> temporary sync branch
    -> resolve/test
    -> merge into feature/main branch
```

Avoid changing large upstream files merely to make plugin packaging work. In particular, `src/server.ts` and `frontend/src/App.tsx` should remain untouched for this MVP unless testing reveals a real blocker.

## 13. Definition of Done

The MVP is done when:

1. root `plugin.json` exists and is valid;
2. root `mcp.json` launches the existing built stdio MCP server;
3. `skills/excalidraw-gpt/SKILL.md` provides concise GPT-specific operating guidance;
4. setup documentation explains build, local canvas, Inspector, tunnel, ChatGPT connection, limitations, and security;
5. existing build/tests pass unchanged;
6. MCP Inspector can read and mutate the live local canvas through the existing tool path;
7. no public exposure of the local REST API is required;
8. any tool annotation changes are minimal, verified against the installed MCP SDK, and covered by existing/new checks;
9. removal of the GPT-specific package files leaves the original upstream runtime architecture intact.

## 14. Deferred Work

Only consider these if the disposable MVP proves useful long enough to justify them:

- Streamable HTTP `/mcp` transport;
- OAuth or mTLS-backed public deployment;
- public Plugin Directory submission;
- tool-surface reduction or GPT-specific tool aliases;
- custom plugin UI;
- persistent auth/config management;
- deeper integration into a future Memoriae canvas.
