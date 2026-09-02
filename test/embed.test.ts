// Mounting the family's tools into a host that is not an MCP client.
//
// The stdio server is one consumer of the registry; a program with its own
// model is another. Both mount the same kit modules, so a kit added to the
// registry is available to both on the same day — and neither reimplements a
// tool.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { familyTools } from '../src/embed.js';
import type { KitModule } from '../src/registry.js';

/** A kit that registers one tool the modern way. */
const fake: KitModule = {
  name: 'billing-kit',
  async register(server) {
    (server as { registerTool: (n: string, c: unknown, h: unknown) => unknown }).registerTool(
      'money_add',
      { title: 'Add money', description: 'Exact addition', inputSchema: { a: 'number' } },
      async (args: Record<string, unknown>) => ({ content: [{ type: 'text', text: String(Number(args.a) + 1) }] }),
    );
    return ['money_add'];
  },
};

/** A kit written against an older SDK shape. */
const legacy: KitModule = {
  name: 'ui-kit',
  async register(server) {
    (server as { tool: (n: string, d: string, s: unknown, h: unknown) => unknown }).tool(
      'ui_vocab', 'The vocabulary', {}, async () => ({ content: [] }),
    );
    return ['ui_vocab'];
  },
};

describe('familyTools', () => {
  it('returns what the kits registered, as values', async () => {
    const { tools } = await familyTools({}, [fake]);
    assert.deepEqual(tools.map((t) => t.name), ['money_add']);
    assert.equal(tools[0]!.description, 'Exact addition');
    assert.deepEqual(tools[0]!.inputSchema, { a: 'number' });
  });

  it('runs a tool without a transport', async () => {
    const { tools } = await familyTools({}, [fake]);
    const out = (await tools[0]!.run({ a: 41 })) as { content: Array<{ text: string }> };
    assert.equal(out.content[0]!.text, '42');
  });

  it('accepts the older registration shape too', async () => {
    // A kit built against an earlier SDK should not be excluded from embedding
    // by the shape of its call.
    const { tools } = await familyTools({}, [legacy]);
    assert.deepEqual(tools.map((t) => t.name), ['ui_vocab']);
  });

  it('reports kits the same way the stdio server does', async () => {
    const { kits } = await familyTools({}, [fake]);
    assert.equal(kits[0]!.state, 'registered');
    assert.deepEqual(kits[0]!.tools, ['money_add']);
  });

  it('mounts nothing, and complains about nothing, with no kits installed', async () => {
    // This server depends on no kit. Absence is an ordinary state.
    const { tools, kits } = await familyTools({}, []);
    assert.deepEqual(tools, []);
    assert.deepEqual(kits, []);
  });
});
