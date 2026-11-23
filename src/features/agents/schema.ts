import { z } from 'zod';

import {
  AGENT_PERMISSION_SCOPES,
  MAX_BUDGET,
  PROVIDER_MODELS,
  agentEndpointUrlSchema,
  agentModelSchema,
  agentProviderSchema,
  requiresEndpoint,
} from '../../lib/validations/agent';

/**
 * Agent form schemas live in `@/lib/validations/agent`. This module re-exports
 * them for the imports that predate that file, plus the aliases the agent
 * configuration form and its tests were first written against.
 *
 * The re-export is relative rather than `@/…` so this module — and the shared
 * rules it pulls in — can be compiled on its own by the `test:agents` script,
 * which runs `tsc` outside the app's `tsconfig` path aliases.
 */
export * from '../../lib/validations/agent';
export {
  AGENT_PROVIDERS as providerOptions,
  AGENT_PROVIDERS as AGENT_PROVIDER_IDS,
} from '../../lib/validations/agent';
/**
 * The configuration form's schema under its original name: `createAgentSchema`
 * is the single source of truth for the form's validation (endpoint, spending
 * limit, transaction cap, timeout), re-exported here so the form and its tests
 * share one set of rules.
 */
export {
  createAgentSchema as agentConfigSchema,
  type CreateAgentInput as AgentConfigFormValues,
} from '../../lib/validations/agent';

// ---------------------------------------------------------------------------
// Agent configuration editor (create / edit submission payload)
// ---------------------------------------------------------------------------

/**
 * Validates the payload produced by the agent configuration editor before it
 * reaches the API or a state store. Budget and token rules are shared with the
 * other agent forms (see `@/lib/validations/agent`); the editor-specific part is
 * the `allowedScopes` permission list and the provider/model consistency check.
 *
 * `allowedScopes` is the editor's name for the `capabilities` field on the
 * Agent domain model. Strict types are inferred from this schema — there are
 * no loose `any` casts — so callers cannot submit an unknown provider or scope.
 */
export const agentConfigurationEditorSchema = z
  .object({
    provider: agentProviderSchema,
    model: agentModelSchema,
    maxBudget: z
      .number({
        required_error: 'Max budget is required',
        invalid_type_error: 'Max budget must be a number',
      })
      .positive('Max budget must be greater than 0')
      .max(MAX_BUDGET, `Max budget cannot exceed ${MAX_BUDGET.toLocaleString('en-US')}`),
    allowedScopes: z
      .array(
        z.enum(AGENT_PERMISSION_SCOPES, {
          errorMap: () => ({ message: 'Unsupported permission scope.' }),
        }),
      )
      .min(1, 'Grant at least one allowed scope.')
      .refine((scopes) => new Set(scopes).size === scopes.length, {
        message: 'Allowed scopes must be unique.',
      }),
    tokenAllocation: z
      .number({
        required_error: 'Token allocation is required',
        invalid_type_error: 'Token allocation must be a number',
      })
      .int('Token allocation must be a whole number')
      .positive('Token allocation must be greater than 0')
      .max(10_000_000, 'Token allocation cannot exceed 10,000,000'),
    endpointUrl: agentEndpointUrlSchema,
  })
  .superRefine((values, ctx) => {
    requireEditorEndpoint(values, ctx);

    const catalog = PROVIDER_MODELS[values.provider];
    if (values.provider !== 'Custom' && catalog.length > 0 && !catalog.includes(values.model)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['model'],
        message: `Select a model offered by ${values.provider}.`,
      });
    }
  });

/** Inferred editor payload: no `any`, no hand-written duplicate of the form type. */
export type AgentConfigurationEditorInput = z.infer<typeof agentConfigurationEditorSchema>;

/** `Custom` models are free-form but still need a reachable endpoint. */
function requireEditorEndpoint(
  values: { provider?: AgentConfigurationEditorInput['provider']; endpointUrl?: string },
  ctx: z.RefinementCtx,
): void {
  if (!values.provider || !requiresEndpoint(values.provider) || values.endpointUrl) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['endpointUrl'],
    message: 'A valid API endpoint URL is required for this provider.',
  });
}
