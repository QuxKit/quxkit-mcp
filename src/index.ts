#!/usr/bin/env node
// The family MCP server, over stdio.
//
// A client (Claude Desktop, Claude Code, any MCP host) spawns this and talks to
// it on stdin/stdout. Nothing here writes to stdout except protocol frames —
// a stray console.log there corrupts the JSON-RPC stream, which is why the
// startup line goes to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, describe } from './server.js';

async function main(): Promise<void> {
  const { server, statuses } = await createServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Say what was actually mounted. "The server started" and "the server can do
  // anything" are different claims, and an operator who installed a kit that
  // failed to load should learn it here rather than from a tool that is
  // mysteriously absent.
  process.stderr.write(`quxkit-mcp ready — ${describe(statuses)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`quxkit-mcp failed to start: ${String(error)}\n`);
  process.exit(1);
});
