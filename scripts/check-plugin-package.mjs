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
