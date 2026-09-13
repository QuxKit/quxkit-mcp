// The family's tools, as plain values, for a host that is not an MCP client.
//
// This server's usual life is a stdio process an assistant spawns. But the
// tools it mounts — exact money arithmetic, the UI vocabulary, a kit's own
// discovery — are just as useful to a program that already has a model in it
// and wants to hand it capabilities directly. QuxCloud's Builder is the case
// in point: it runs its own crew, in its own process, and spawning a
// subprocess to speak JSON-RPC to itself would be ceremony rather than
// architecture.
//
// So: mount the same kit modules onto a RECORDING server and keep what they
// registered. Nothing here reimplements a tool or knows which kits exist —
// the registry decides that, exactly as it does for the stdio server, and a
// kit added there is available here on the same day.
//
// The recorder is deliberately shaped like the SDK's `registerTool`, because
// the kit modules are written against the SDK and must not have to know they
// are being embedded.

import { type KitModule, type KitStatus, registerKits } from './registry.js';
import { KITS } from './server.js';

/** What a mounted tool looks like to a host that is not speaking MCP. */
export interface EmbeddedTool {
  name: string;
  title?: string;
  description?: string;
  /** The SDK's inputSchema, as the kit declared it. */
  inputSchema?: unknown;
  /** Call it. The return is the MCP content payload the tool produced. */
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface EmbedResult {
  tools: EmbeddedTool[];
  /** Which kits mounted, which were absent, which failed — the same report the
   *  stdio server prints at startup. */
  kits: KitStatus[];
}

/**
 * Mount every available kit and return its tools as values.
 *
 * A kit that is not installed contributes nothing and is reported as absent,
 * which is this server's whole philosophy: it depends on no kit, and mounts
 * what the operator already has under whatever terms they hold it.
 */
export async function familyTools(
  env: NodeJS.ProcessEnv = process.env,
  modules: readonly KitModule[] = KITS,
): Promise<EmbedResult> {
  const tools: EmbeddedTool[] = [];

  // Shaped like McpServer's surface, and only the part the kit modules use.
  // Anything else they reach for should fail loudly here rather than be
  // silently swallowed into a half-mounted tool.
  const recorder = {
    registerTool(
      name: string,
      config: { title?: string; description?: string; inputSchema?: unknown },
      handler: (args: Record<string, unknown>) => Promise<unknown> | unknown,
    ) {
      tools.push({
        name,
        ...(config?.title === undefined ? {} : { title: config.title }),
        ...(config?.description === undefined ? {} : { description: config.description }),
        ...(config?.inputSchema === undefined ? {} : { inputSchema: config.inputSchema }),
        run: async (args) => handler(args ?? {}),
      });
      return { name };
    },
    // Older registrations use `tool(name, description, schema, handler)`.
    // Supported because a kit built against an earlier SDK should not be
    // excluded from embedding by the shape of its call.
    tool(
      name: string,
      description: string,
      inputSchema: unknown,
      handler: (args: Record<string, unknown>) => unknown,
    ) {
      tools.push({ name, description, inputSchema, run: async (args) => handler(args ?? {}) });
      return { name };
    },
  };

  const kits = await registerKits(recorder, modules, env);
  return { tools, kits };
}
