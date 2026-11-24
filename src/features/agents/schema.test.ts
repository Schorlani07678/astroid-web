import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_PROVIDERS,
  PROVIDER_MODELS,
  agentConfigPanelSchema,
  agentConfigurationEditorSchema,
  agentConfigSchema,
  updateAgentSchema,
  type AgentConfigurationEditorInput,
} from './schema';
import { agentProviderConfigSchema } from './providerConfigSchema';

type ParseResult =
  | { success: true }
  | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };

/** First validation message for a field, including errors on array items. */
const issueFor = (result: ParseResult, field: string) =>
  (result.success ? [] : result.error.issues).find((issue) => issue.path[0] === field)?.message;

const validAgentConfig = {
  name: 'Treasury agent',
  provider: 'Nvidia',
  model: 'meta/llama-3.1-405b-instruct',
  mode: 'assisted',
  temperature: 0.2,
  maxTokens: 2_048,
  monthlyBudget: 500,
} as const;

const validPanelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2_048,
  systemPrompt: 'You are a treasury agent.',
} as const;

const validEditorConfig = {
  provider: 'Nvidia',
  model: 'meta/llama-3.1-405b-instruct',
  maxBudget: 500,
  allowedScopes: ['wallet.read', 'analytics.read'],
  tokenAllocation: 4_096,
} as const;

test('create schema enforces the inclusive 0–2 temperature range', () => {
  for (const temperature of [0, 2]) {
    assert.equal(
      agentConfigSchema.safeParse({ ...validAgentConfig, temperature }).success,
      true,
      String(temperature),
    );
  }

  for (const temperature of [-0.1, -1, 2.1, 3]) {
    const result = agentConfigSchema.safeParse({
      ...validAgentConfig,
      temperature,
    }) as ParseResult;
    assert.ok(issueFor(result, 'temperature'), String(temperature));
  }
});

test('create schema rejects negative and zero monthly spending limits', () => {
  for (const monthlyBudget of [-500, -0.01, 0]) {
    const result = agentConfigSchema.safeParse({
      ...validAgentConfig,
      monthlyBudget,
    }) as ParseResult;
    assert.ok(issueFor(result, 'monthlyBudget'), String(monthlyBudget));
  }
});

test('create schema requires a positive whole-number max tokens cap', () => {
  for (const maxTokens of [0, -1, -2_048, 1.5, 1_000_001]) {
    const result = agentConfigSchema.safeParse({
      ...validAgentConfig,
      maxTokens,
    }) as ParseResult;
    assert.ok(issueFor(result, 'maxTokens'), String(maxTokens));
  }

  for (const maxTokens of [1, 1_000_000]) {
    assert.equal(
      agentConfigSchema.safeParse({ ...validAgentConfig, maxTokens }).success,
      true,
      String(maxTokens),
    );
  }
});

test('update schema applies the same temperature, budget, and token bounds to provided fields', () => {
  const invalid = updateAgentSchema.safeParse({
    temperature: -0.5,
    monthlyBudget: -100,
    maxTokens: 0,
  }) as ParseResult;
  assert.ok(issueFor(invalid, 'temperature'));
  assert.ok(issueFor(invalid, 'monthlyBudget'));
  assert.ok(issueFor(invalid, 'maxTokens'));

  const valid = updateAgentSchema.safeParse({ temperature: 1.5, maxTokens: 4_096 });
  assert.equal(valid.success, true);
});

test('panel schema accepts a valid configuration and rejects out-of-range values', () => {
  assert.equal(agentConfigPanelSchema.safeParse(validPanelConfig).success, true);

  for (const temperature of [-0.1, 2.1]) {
    const result = agentConfigPanelSchema.safeParse({
      ...validPanelConfig,
      temperature,
    }) as ParseResult;
    assert.ok(issueFor(result, 'temperature'), String(temperature));
  }

  for (const maxTokens of [0, -1, 1.5, 1_000_001]) {
    const result = agentConfigPanelSchema.safeParse({
      ...validPanelConfig,
      maxTokens,
    }) as ParseResult;
    assert.ok(issueFor(result, 'maxTokens'), String(maxTokens));
  }
});

test('agent config rejects a model outside the selected provider catalog', () => {
  const result = agentConfigSchema.safeParse({
    name: 'Treasury agent',
    description: '',
    provider: 'OpenAI',
    model: 'claude-3-5-sonnet-latest',
    endpointUrl: '',
    mode: 'assisted',
    temperature: 0.2,
    monthlyBudget: 500,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path[0] === 'model'));
  }
});

test('provider configuration rejects an empty custom endpoint', () => {
  const result = agentProviderConfigSchema.safeParse({
    name: 'Local agent',
    provider: 'custom',
    model: 'finance-model-v1',
    temperature: 0.7,
    endpointUrl: '',
    apiKey: '',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path[0] === 'endpointUrl'));
  }
});

test('editor schema accepts a valid configuration and trims the model name', () => {
  const result = agentConfigurationEditorSchema.safeParse({
    ...validEditorConfig,
    model: '  meta/llama-3.1-405b-instruct  ',
  });

  assert.equal(result.success, true);
  if (result.success) {
    const parsed: AgentConfigurationEditorInput = result.data;
    assert.equal(parsed.model, 'meta/llama-3.1-405b-instruct');
    assert.deepEqual(parsed.allowedScopes, ['wallet.read', 'analytics.read']);
  }
});

test('editor schema accepts every supported provider with a catalog model', () => {
  for (const provider of AGENT_PROVIDERS) {
    const config = {
      ...validEditorConfig,
      provider,
      model: provider === 'Custom' ? 'my-org/finance-agent-v1' : PROVIDER_MODELS[provider][0] ?? '',
      endpointUrl: provider === 'Custom' || provider === 'Ollama' ? 'http://localhost:11434' : '',
    };
    assert.equal(agentConfigurationEditorSchema.safeParse(config).success, true, provider);
  }
});

test('editor schema rejects unsupported provider strings', () => {
  for (const provider of ['Skynet', 'openai', '', '  ']) {
    const result = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      provider,
    }) as ParseResult;
    assert.equal(issueFor(result, 'provider'), 'Select a supported provider.', provider);
  }
});

test('editor schema rejects empty or whitespace-only model names', () => {
  for (const model of ['', '   ']) {
    const result = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      model,
    }) as ParseResult;
    assert.ok(issueFor(result, 'model'), model);
  }
});

test('editor schema rejects a model from another provider catalog', () => {
  const result = agentConfigurationEditorSchema.safeParse({
    ...validEditorConfig,
    provider: 'OpenAI',
    model: 'claude-3-5-sonnet-latest',
  }) as ParseResult;
  assert.equal(issueFor(result, 'model'), 'Select a model offered by OpenAI.');
});

test('editor schema requires a positive max budget', () => {
  for (const maxBudget of [0, -25, '', '   ', 100_000_001]) {
    const result = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      maxBudget,
    }) as ParseResult;
    assert.ok(issueFor(result, 'maxBudget'), String(maxBudget));
  }
});

test('editor schema requires at least one known, unique allowed scope', () => {
  const empty = agentConfigurationEditorSchema.safeParse({
    ...validEditorConfig,
    allowedScopes: [],
  }) as ParseResult;
  assert.equal(issueFor(empty, 'allowedScopes'), 'Grant at least one allowed scope.');

  const unknown = agentConfigurationEditorSchema.safeParse({
    ...validEditorConfig,
    allowedScopes: ['wallet.read', 'root.access'],
  }) as ParseResult;
  assert.equal(issueFor(unknown, 'allowedScopes'), 'Unsupported permission scope.');

  const duplicates = agentConfigurationEditorSchema.safeParse({
    ...validEditorConfig,
    allowedScopes: ['wallet.read', 'wallet.read'],
  }) as ParseResult;
  assert.equal(issueFor(duplicates, 'allowedScopes'), 'Allowed scopes must be unique.');
});

test('editor schema requires a positive whole-number token allocation', () => {
  for (const tokenAllocation of [0, -1, -4_096, 1.5, '', '   ']) {
    const result = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      tokenAllocation,
    }) as ParseResult;
    assert.ok(issueFor(result, 'tokenAllocation'), String(tokenAllocation));
  }
});

test('editor schema requires an http(s) endpoint for self-hosted providers', () => {
  for (const provider of ['Ollama', 'Custom'] as const) {
    const model = provider === 'Custom' ? 'my-org/finance-agent-v1' : PROVIDER_MODELS.Ollama[0] ?? '';

    const missing = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      provider,
      model,
    }) as ParseResult;
    assert.equal(
      issueFor(missing, 'endpointUrl'),
      'A valid API endpoint URL is required for this provider.',
    );

    const invalid = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      provider,
      model,
      endpointUrl: 'javascript:alert(1)',
    }) as ParseResult;
    assert.ok(issueFor(invalid, 'endpointUrl'), provider);

    const valid = agentConfigurationEditorSchema.safeParse({
      ...validEditorConfig,
      provider,
      model,
      endpointUrl: 'https://inference.example.com/v1',
    });
    assert.equal(valid.success, true, provider);
  }
});
