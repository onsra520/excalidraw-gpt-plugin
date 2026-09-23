# Excalidraw GPT Plugin Setup

This MVP keeps the Excalidraw canvas and REST API private on the local machine. ChatGPT reaches the existing stdio MCP server through OpenAI Secure MCP Tunnel; port 3000 is never exposed publicly.

## 1. Build and verify locally

From the repository root:

```powershell
npm ci
npm run build
npm test
```

Start the local canvas in a separate terminal:

```powershell
npm run canvas
```

Open `http://127.0.0.1:3000` in a browser. Keep the browser tab open for screenshots, image export, Mermaid conversion, and viewport control.

## 2. Inspect the stdio MCP server

From the repository root:

```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

Verify at least these tools:

- `describe_scene`
- `batch_create_elements`
- `update_element`
- `delete_element`
- `get_canvas_screenshot`

Start with `describe_scene`, make a small create/update/delete change, then use `get_canvas_screenshot` to verify the rendered result.

## 3. Connect through OpenAI Secure MCP Tunnel

Create a tunnel in OpenAI Platform tunnel settings and associate it with the target Platform organization and ChatGPT workspace.

Run `tunnel-client` from this repository root so the stdio process inherits the expected working directory. Initialize a local stdio profile using an absolute path to the built entry point:

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

Keep `tunnel-client run` healthy while ChatGPT uses the app. The tunnel client needs outbound HTTPS to OpenAI and local access to the stdio command; it does not require inbound internet access to the canvas server.

## 4. Create the ChatGPT developer-mode app

1. Enable Developer mode in ChatGPT if the target workspace allows it.
2. Open ChatGPT Plugins and select the plus button.
3. Choose **Tunnel** under Connection.
4. Select the associated tunnel or enter its tunnel ID.
5. Review the discovered tools and create the app.
6. Test read operations first, then create/update/delete operations if the workspace permits MCP writes.

The ChatGPT tunnel app is a registered workspace connection. The repository's root `mcp.json` is the portable Agent Plugins definition for clients that can launch bundled stdio servers; ChatGPT Web reaches this local server through the registered Secure MCP Tunnel instead of executing the local `mcp.json` declaration on your machine by itself.

## 5. Security boundaries

- Keep the canvas server bound to `127.0.0.1`.
- Do not port-forward or tunnel `http://127.0.0.1:3000` directly to the internet.
- Do not commit `CONTROL_PLANE_API_KEY`, tunnel IDs, or workspace-specific app IDs.
- Secure MCP Tunnel is the remote bridge for this MVP.
- Public plugin submission is out of scope and requires a stable public HTTPS MCP endpoint rather than this private tunnel-only setup.

## 6. Common failures

- `dist/index.js` missing: run `npm run build`.
- `node` not found: install Node.js >=20 and ensure it is on `PATH`.
- Port 3000 occupied by another service: stop the conflicting process before starting the canvas.
- Canvas tool says the service is unreachable: run `npm run canvas`, or let the MCP server auto-start it, then verify `http://127.0.0.1:3000/health` locally.
- Screenshot/image export fails: make sure the browser canvas is open and connected.
- Tunnel health check fails: run `tunnel-client doctor --profile excalidraw-local --explain` and verify the runtime API key, tunnel ID, and local stdio command.
- Tunnel is not visible in ChatGPT: verify workspace association plus Tunnels Read + Use permissions.
- Write tools are unavailable or blocked: verify the target ChatGPT workspace's current MCP/developer-mode entitlement and approval policy.

## 7. Portable plugin files

The portable package is intentionally small:

```text
plugin.json
mcp.json
skills/excalidraw-skill/SKILL.md
```

`plugin.json` supplies plugin identity and OpenAI presentation metadata. `mcp.json` declares the existing local stdio entry point (`node ${PLUGIN_ROOT}/dist/index.js`). The existing Excalidraw skill supplies diagram workflow guidance. Removing these packaging additions does not change the underlying canvas runtime architecture.
