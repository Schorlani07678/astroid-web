/**
 * Provider settings schema for the agent page. The rules live in
 * `lib/validations/agent` (shared with every other agent form) so provider
 * key formats, endpoint rules and model catalogs cannot drift between forms.
 *
 * The re-export is relative rather than `@/…` so the schema tests can run
 * under `tsx` without the app's path aliases.
 */
export {
  AGENT_PROVIDER_TYPES as agentProviderTypes,
  PROVIDER_API_KEY_RULES,
  agentProviderConfigSchema,
  isHostedProvider,
  providerModelOptions,
  validateProviderApiKey,
  validateProviderEndpoint,
  type AgentProviderConfigValues,
  type AgentProviderType,
} from '../../lib/validations/agent';
