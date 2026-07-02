import { registerBuiltinExtension } from '../loader';
import { createClawHubMarketplaceExtension } from './clawhub-marketplace';
import { createCwwSkillHubMarketplaceExtension } from './cww-skillhub-marketplace';
import { createDiagnosticsExtension } from './diagnostics';

export function registerAllBuiltinExtensions(): void {
  registerBuiltinExtension('builtin/clawhub-marketplace', createClawHubMarketplaceExtension);
  registerBuiltinExtension('builtin/cww-skillhub-marketplace', createCwwSkillHubMarketplaceExtension);
  registerBuiltinExtension('builtin/diagnostics', createDiagnosticsExtension);
}
