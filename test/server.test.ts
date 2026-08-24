import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KitModule } from '../src/registry.js';
import { createServer } from '../src/server.js';

// A real server, a real client, a real protocol round trip — over an in-memory
// transport rather than a spawned process. The registry tests cover the
// decisions; this covers the thing those decisions are for: that a kit's tools
// actually arrive at a client.

/** A kit that registers one real tool on the real server it is handed. */
const fakeKit = (name: string, toolName: string): KitModule =>
  ({
    name,
    async register(server: unknown) {
      (server as McpServer).registerTool(
        toolName,
        { title: toolName, description: `from ${name}`, inputSchema: {} },
        async () => ({ content: [{ type: 'text' as const, text: `${name} answered` }] }),
      );
      return [toolName];
    },
  }) as unknown as KitModule;

async function connect(modules: readonly KitModule[]) {
  const { server, statuses } = await createServer({} as NodeJS.ProcessEnv, modules);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, statuses };
}

describe('the family server', () => {
  it('offers the tools of every kit it mounted, from one connection', async () => {
    // The whole point of consolidating: one client, one server, tools from
    // several kits — not one connection per kit that cannot compose.
    const { client } = await connect([
      fakeKit('billing-kit', 'billing_price_quote'),
      fakeKit('ui-kit', 'ui_kit_vocabulary'),
    ]);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    assert.deepEqual(names, ['billing_price_quote', 'quxkit_status', 'ui_kit_vocabulary']);
  });

  it('actually calls through to the kit that registered a tool', async () => {
    // Listing a tool and being able to run it are different claims.
    const { client } = await connect([fakeKit('translation-kit', 'translation_lookup')]);

    const result = await client.callTool({ name: 'translation_lookup', arguments: {} });
    const content = result.content as { type: string; text: string }[];

    assert.equal(content[0]!.text, 'translation-kit answered');
  });

  it('can still list tools when no kit is installed', async () => {
    // Without quxkit_status the SDK advertises no tools capability at all, and
    // `tools/list` answers "Method not found" — an operator with a broken
    // config would see a protocol error instead of an explanation.
    const { client } = await connect([]);

    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      ['quxkit_status'],
    );
  });

  it('says which kit failed, through the protocol rather than only on stderr', async () => {
    const broken: KitModule = {
      name: 'ui-kit',
      async register() {
        throw new Error('missing peer');
      },
    } as unknown as KitModule;

    const { client } = await connect([fakeKit('billing-kit', 'billing_price_quote'), broken]);

    const result = await client.callTool({ name: 'quxkit_status', arguments: {} });
    const content = result.content as { type: string; text: string }[];
    const body = JSON.parse(content[0]!.text) as {
      kits: { kit: string; state: string; detail?: string }[];
    };

    const failed = body.kits.find((k) => k.state === 'failed');
    assert.equal(failed?.kit, 'ui-kit');
    assert.match(failed?.detail ?? '', /missing peer/);
    // And the working kit is unaffected — one broken kit costs only itself.
    assert.ok(body.kits.some((k) => k.kit === 'billing-kit' && k.state === 'registered'));
  });
});
