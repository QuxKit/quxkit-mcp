/**
 * One MCP server for the QuxKit family.
 *
 * Before this there was one server per kit: billing-kit-mcp and ui-kit-mcp,
 * each its own binary, each its own entry in a client's config. That scales
 * badly in the obvious way — five kits, five servers, five processes — and in a
 * less obvious one: an assistant holding five connections has no way to know
 * they describe one system, so nothing composes. A question that spans billing
 * and UI is two conversations.
 *
 * This registers whichever kits are installed onto a single server. It depends
 * on none of them; see registry.ts for why that is a design decision rather
 * than a convenience.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { billingKit } from './kits/billing.js';
import { translationKit } from './kits/translation.js';
import { uiKit } from './kits/ui.js';
import type { KitModule, KitStatus } from './registry.js';
import { registerKits } from './registry.js';

export const KITS: readonly KitModule[] = [billingKit, uiKit, translationKit];

export interface CreateServerResult {
  server: McpServer;
  statuses: KitStatus[];
}

export async function createServer(
  env: NodeJS.ProcessEnv = process.env,
  modules: readonly KitModule[] = KITS,
): Promise<CreateServerResult> {
  const server = new McpServer({ name: 'quxkit', version: '0.1.0' });
  const statuses = await registerKits(server, modules, env);

  // Always registered, and the reason is not tidiness.
  //
  // With no kits installed the SDK advertises no `tools` capability at all, so
  // `tools/list` answers "Method not found" — a client cannot even discover
  // that the server has nothing, and an operator whose config is wrong sees a
  // protocol error rather than an explanation. One tool guarantees the
  // capability exists and makes the server able to describe itself.
  //
  // It is also the tool an assistant actually wants first: which kits are here,
  // and which are installed but broken.
  server.registerTool(
    'quxkit_status',
    {
      title: 'Which QuxKit tools are available',
      description:
        'The kits this server found, the tools each contributed, and any kit that is installed but failed to load. Ask this before assuming a capability is missing — it may be a configuration problem rather than an absent feature.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              server: 'quxkit',
              kits: statuses,
              hint: statuses.every((s) => s.state !== 'registered')
                ? 'No kits are installed alongside this server. Install the kit packages you use — this server depends on none of them and mounts whatever it finds.'
                : undefined,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  return { server, statuses };
}

export type { KitModule, KitName, KitStatus } from './registry.js';
export { describe } from './registry.js';
