/**
 * Which kits this process can actually offer.
 *
 * The design decision this file exists for: **the family server depends on no
 * kit.** Each one is loaded with a dynamic import inside a try, and a kit that
 * is not installed is simply not offered.
 *
 * Three reasons that is not just convenience.
 *
 * A hard dependency on all of them would mean installing billing-kit to get
 * translation tools — the family is deliberately separable, and a server that
 * un-separates it is working against the thing it serves.
 *
 * The kits are not licensed alike. billing-kit is Apache-2.0; UI-Kit, comm-kit
 * and rag-kit are commercial per seat. A package that bundled all of their
 * tooling would be redistributing commercial source under whatever licence it
 * chose for itself. Loading what the operator already has, on their own terms,
 * sidesteps that entirely.
 *
 * And it is honest about failure. A kit that is present but broken — a missing
 * peer, a bad build — is reported by name rather than taking the whole server
 * down, so an operator sees "ui-kit failed to load: …" instead of a process
 * that exits before any tool is registered.
 */

export type KitName = 'billing-kit' | 'ui-kit' | 'translation-kit';

export interface KitStatus {
  kit: KitName;
  /** Registered, skipped because it is not installed, or present and broken. */
  state: 'registered' | 'absent' | 'failed';
  /** Tool names this kit contributed. */
  tools: string[];
  /** Why it was skipped, when that is not obvious. */
  detail?: string;
}

/** What a kit module must do to be mountable. */
export interface KitModule {
  name: KitName;
  /**
   * Import the kit and register its tools.
   *
   * Returns the tool names it added — reported at startup, because "the server
   * is running" and "the server can do anything" are different claims and an
   * operator should be able to tell them apart.
   */
  register(server: unknown, env: NodeJS.ProcessEnv): Promise<string[]>;
}

/** `import()` a package, returning null when it simply is not installed. */
export async function optionalImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch (error) {
    // MODULE_NOT_FOUND means "not installed", which is an ordinary state here.
    // Anything else — a syntax error, a failed native binding — is a real
    // problem and must not be disguised as absence.
    const code = (error as { code?: string })?.code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

export async function registerKits(
  server: unknown,
  modules: readonly KitModule[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<KitStatus[]> {
  const statuses: KitStatus[] = [];

  for (const mod of modules) {
    try {
      const tools = await mod.register(server, env);
      statuses.push(
        tools.length > 0
          ? { kit: mod.name, state: 'registered', tools }
          : { kit: mod.name, state: 'absent', tools: [], detail: 'not installed' },
      );
    } catch (error) {
      // One broken kit must not cost the operator every other kit's tools.
      statuses.push({
        kit: mod.name,
        state: 'failed',
        tools: [],
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return statuses;
}

/** A one-line summary for stderr — never stdout, which is the protocol channel. */
export function describe(statuses: readonly KitStatus[]): string {
  const registered = statuses.filter((s) => s.state === 'registered');
  const failed = statuses.filter((s) => s.state === 'failed');
  const toolCount = registered.reduce((n, s) => n + s.tools.length, 0);

  const parts = [
    registered.length === 0
      ? 'no kits found'
      : `${registered.map((s) => s.kit).join(', ')} — ${toolCount} tools`,
  ];
  for (const failure of failed) parts.push(`${failure.kit} FAILED: ${failure.detail}`);
  return parts.join('; ');
}
