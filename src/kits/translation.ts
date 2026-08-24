/**
 * translation-kit's tools.
 *
 * The only kit here that needs a database before it can say anything: billing's
 * arithmetic and UI-Kit's registry both answer from what is installed, but
 * "what does this app call the checkout button" is a question only this
 * product's data can answer.
 *
 * So it registers nothing without `TRANSLATION_KIT_MCP_DATABASE_URL` and a
 * tenant. Offering tools that fail on every call is worse than offering none —
 * an assistant cannot tell a misconfiguration from an empty catalogue, and will
 * confidently report that a product has no strings.
 */
import type { KitModule } from '../registry.js';
import { optionalImport } from '../registry.js';

interface TranslationKit {
  createCatalogue(opts: { db: unknown }): unknown;
  createBundles(opts: { db: unknown }): unknown;
  registerTranslationTools(
    server: unknown,
    options: { catalogue: unknown; bundles: unknown; tenantId: string; allowPublish?: boolean },
  ): void;
}

export const translationKit: KitModule = {
  name: 'translation-kit',

  async register(server, env) {
    const mod = await optionalImport<TranslationKit>('@quxkit/translation-kit');
    if (!mod?.registerTranslationTools) return [];

    const url = env.TRANSLATION_KIT_MCP_DATABASE_URL;
    const tenantId = env.TRANSLATION_KIT_MCP_TENANT;
    if (!url || !tenantId) return [];

    // `pg` is the host's, not ours. This package depends on no driver: an
    // operator running translation-kit already has one, and a second copy in
    // the dependency tree is a second connection pool nobody asked for.
    const pg = await optionalImport<{ default: { Pool: new (c: { connectionString: string }) => unknown } }>(
      'pg',
    );
    if (!pg) return [];

    const pool = new pg.default.Pool({ connectionString: url }) as {
      query(text: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
    };

    // The SqlExecutor seam, over the host's pool. Read-only by construction:
    // `transaction` throws, so nothing reachable from a tool can write even if
    // a future tool forgets to be careful. `publish` needs a transaction, which
    // is exactly why it is not available through this path.
    const db = {
      async query(text: string, params?: readonly unknown[]) {
        const result = await pool.query(text, params);
        return result.rows;
      },
      async transaction() {
        throw new Error(
          'This MCP connection is read-only. Publishing goes through your own application, where it can be authorised.',
        );
      },
    };

    mod.registerTranslationTools(server, {
      catalogue: mod.createCatalogue({ db }),
      bundles: mod.createBundles({ db }),
      tenantId,
      // Deliberately never enabled from here. Publishing puts words in front of
      // users and needs a transaction this connection refuses; a server an
      // assistant talks to is not where that decision belongs.
      allowPublish: false,
    });

    return ['translation locales, lookup, search and untranslated'];
  },
};
