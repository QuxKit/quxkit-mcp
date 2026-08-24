/**
 * UI-Kit's tools, mounted from `@quxkit/ui-kit-mcp`.
 *
 * That package used to be a script that started a server on import; it now
 * exports `registerUiKitTools`, which is what makes this file two lines of real
 * work instead of a copy of its five tools.
 *
 * UI-Kit is commercial and licensed per seat. Nothing here bundles it or grants
 * anything: if an operator has it installed, they have it under whatever terms
 * they hold, and this mounts what they already own. If they do not, the tools
 * are absent and nothing complains.
 */
import type { KitModule } from '../registry.js';
import { optionalImport } from '../registry.js';

interface UiKitMcp {
  registerUiKitTools(server: unknown): void;
  componentCount?(): number;
}

export const uiKit: KitModule = {
  name: 'ui-kit',

  async register(server) {
    const mod = await optionalImport<UiKitMcp>('@quxkit/ui-kit-mcp');
    if (!mod?.registerUiKitTools) return [];

    mod.registerUiKitTools(server);

    const count = mod.componentCount?.();
    return [`ui_kit vocabulary, components${count ? ` (${count})` : ''}, tokens and usage check`];
  },
};
