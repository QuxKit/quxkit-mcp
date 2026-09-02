/**
 * billing-kit's tools, mounted from `@quxkit/billing-kit-mcp`.
 *
 * That package already exposed its registrations as functions — it was built to
 * be composed — so nothing here reimplements a tool. It imports what exists and
 * mounts it on the family server.
 *
 * The database is optional, exactly as it is there: without one the server is
 * arithmetic and discovery, which is still the most useful half. Exact money
 * math is the thing an assistant most reliably gets wrong, and it needs no
 * connection at all.
 */
import type { KitModule } from '../registry.js';
import { optionalImport } from '../registry.js';

interface BillingMcp {
  registerLedgerTools(server: unknown): void;
  registerPriceTools(server: unknown): void;
  registerDiscoveryTools(server: unknown): void;
  registerDbTools?(server: unknown, options: unknown): void;
  registerResources?(server: unknown, options?: unknown): void;
  registerPrompts?(server: unknown, options?: unknown): void;
}

export const billingKit: KitModule = {
  name: 'billing-kit',

  async register(server, env) {
    // The bare specifier first, the deep path second, and the order matters
    // in both directions.
    //
    // That package used to declare a `bin` and neither `main` nor `exports`,
    // so only the deep path resolved — it was published to be spawned, not
    // imported. It now exports its registrations properly, and an `exports`
    // map CLOSES every path it does not name: the deep import that was the
    // only way in became the one way that fails. Trying the bare name first
    // and keeping the old path as a fallback works against both, which is
    // what a server that mounts whatever an operator happens to have installed
    // has to do.
    const mod =
      (await optionalImport<BillingMcp>('@quxkit/billing-kit-mcp')) ??
      (await optionalImport<BillingMcp>('@quxkit/billing-kit-mcp/dist/index.js'));
    if (!mod?.registerLedgerTools) return [];

    // Arithmetic and discovery: no connection, no configuration, always safe.
    mod.registerLedgerTools(server);
    mod.registerPriceTools(server);
    mod.registerDiscoveryTools(server);

    const tools = ['billing price + ledger arithmetic', 'billing discovery'];

    // The DB-backed reads only exist if the operator pointed us at a database.
    // Registering them without one would give an assistant tools that fail on
    // every call, which is worse than not offering them.
    if (env.BILLING_KIT_MCP_DATABASE_URL && mod.registerDbTools) {
      // Through optionalImport, not a literal `import()`. A literal specifier
      // is statically resolved by the compiler, and this package is optional by
      // design — typechecking would fail on a machine that has not installed
      // the very thing we are checking for at runtime.
      const dbMod = await optionalImport<{ openDatabase(url: string): unknown }>(
        '@quxkit/billing-kit-mcp/dist/db.js',
      );
      if (dbMod) {
        mod.registerDbTools(server, {
          db: dbMod.openDatabase(env.BILLING_KIT_MCP_DATABASE_URL),
          tenantScope: env.BILLING_KIT_MCP_TENANT,
        });
        tools.push('billing database reads');
      }
    }

    mod.registerResources?.(server);
    mod.registerPrompts?.(server);

    return tools;
  },
};
