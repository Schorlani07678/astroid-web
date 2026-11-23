import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agentProviderConfigSchema,
  agentConfigurationSchema,
  agentWizardSchema,
  createAgentSchema,
  providerModelOptions,
  templateWizardSchema,
  updateAgentSchema,
} from './agent';

const messages = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]));

const validConfig = {
  name: 'Treasury Rebalancer',
  provider: 'OpenAI',
  model: 'gpt-4o',
  mode: 'assisted',
  temperature: 0.7,
  monthlyBudget: 500,
} as const;

test('createAgentSchema accepts a valid configuration', () => {
  assert.equal(createAgentSchema.safeParse(validConfig).success, true);
});

test('createAgentSchema trims the name, so spaces are an empty name', () => {
  const result = createAgentSchema.safeParse({ ...validConfig, name: '   ' });
  assert.equal(result.success, false);
  assert.ok(messages(result).name);
});

test('createAgentSchema rejects a negative or zero monthly budget', () => {
  for (const monthlyBudget of [-5, 0]) {
    const result = createAgentSchema.safeParse({ ...validConfig, monthlyBudget });
    assert.equal(messages(result).monthlyBudget, 'Monthly budget must be greater than 0');
  }
});

test('createAgentSchema requires an endpoint for self-hosted and custom providers', () => {
  const custom = messages(createAgentSchema.safeParse({ ...validConfig, provider: 'Custom' }));
  assert.equal(custom.endpointUrl, 'A custom provider requires an API endpoint URL.');
  const ollama = messages(createAgentSchema.safeParse({ ...validConfig, provider: 'Ollama' }));
  assert.equal(ollama.endpointUrl, 'A valid API endpoint URL is required for this provider.');
});

test('createAgentSchema only accepts http(s) endpoints', () => {
  for (const endpointUrl of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://host/x', 'not a url']) {
    const result = createAgentSchema.safeParse({ ...validConfig, provider: 'Custom', endpointUrl });
    assert.equal(result.success, false, endpointUrl);
  }
  const ok = createAgentSchema.safeParse({ ...validConfig, provider: 'Custom', endpointUrl: 'https://api.example.com/v1' });
  assert.equal(ok.success, true);
});

test('createAgentSchema rejects an unknown provider with the shared message', () => {
  const result = createAgentSchema.safeParse({ ...validConfig, provider: 'Skynet' });
  assert.equal(messages(result).provider, 'Select a supported provider.');
});

test('updateAgentSchema needs at least one field and validates the ones present', () => {
  assert.equal(messages(updateAgentSchema.safeParse({}))[''], 'Provide at least one field to update.');
  assert.equal(updateAgentSchema.safeParse({ temperature: 1 }).success, true);
  assert.ok(messages(updateAgentSchema.safeParse({ temperature: 3 })).temperature);
  assert.ok(messages(updateAgentSchema.safeParse({ provider: 'Custom' })).endpointUrl);
});

const validWizard = {
  name: 'Payroll Agent',
  description: 'Settles contractor invoices weekly',
  ownerDepartment: 'Finance',
  provider: 'Anthropic',
  model: 'claude-3-5-sonnet-latest',
  budget: 1000,
  singleTransactionCap: 100,
} as const;

test('agentWizardSchema accepts a valid registration', () => {
  assert.equal(agentWizardSchema.safeParse(validWizard).success, true);
});

test('agentWizardSchema spending limits must be greater than zero', () => {
  const zero = messages(agentWizardSchema.safeParse({ ...validWizard, budget: 0 }));
  assert.equal(zero.budget, 'Budget must be greater than 0');
  const empty = messages(agentWizardSchema.safeParse({ ...validWizard, singleTransactionCap: '' }));
  assert.equal(empty.singleTransactionCap, 'Single-transaction cap must be greater than 0');
});

test('agentWizardSchema keeps a single transaction within the budget', () => {
  const result = agentWizardSchema.safeParse({ ...validWizard, singleTransactionCap: 5000 });
  assert.equal(messages(result).singleTransactionCap, 'Single-transaction cap cannot exceed the budget');
});

test('agentWizardSchema rejects an API key with spaces', () => {
  const result = agentWizardSchema.safeParse({ ...validWizard, apiKey: 'sk test' });
  assert.equal(messages(result).apiKey, 'API key cannot contain spaces');
});

const validTemplate = {
  templateId: 'treasury',
  name: 'Treasury Bot',
  description: 'Rebalances the treasury weekly',
  ownerDepartment: 'Finance',
  provider: 'OpenAI',
  model: 'gpt-4o',
  budget: 1000,
  singleTransactionCap: 100,
  maxHourlyBudgetUsd: 50,
  requireApprovalAbove: 10,
  allowedNetworks: ['stellar'],
} as const;

test('templateWizardSchema accepts a valid template and shares the provider rule', () => {
  assert.equal(templateWizardSchema.safeParse(validTemplate).success, true);
  const result = templateWizardSchema.safeParse({ ...validTemplate, provider: 'Skynet' });
  assert.equal(messages(result).provider, 'Select a supported provider.');
});

const validSettings = { name: 'Primary', provider: 'openai', model: 'gpt-4o', temperature: 0.7, apiKey: `sk-proj-${'a'.repeat(40)}` } as const;

test('agentProviderConfigSchema accepts a hosted provider with a key and a catalog model', () => {
  assert.equal(agentProviderConfigSchema.safeParse(validSettings).success, true);
});

test('agentProviderConfigSchema requires a key for hosted providers and an endpoint for the rest', () => {
  assert.equal(
    messages(agentProviderConfigSchema.safeParse({ ...validSettings, apiKey: undefined })).apiKey,
    'An API key is required for this provider.',
  );
  const ollama = messages(
    agentProviderConfigSchema.safeParse({ ...validSettings, provider: 'ollama', model: 'mistral', apiKey: undefined }),
  );
  assert.equal(ollama.endpointUrl, 'An endpoint URL is required for this provider.');
});

test('agentProviderConfigSchema rejects a model that belongs to another provider', () => {
  const result = agentProviderConfigSchema.safeParse({ ...validSettings, model: providerModelOptions.anthropic[0] });
  assert.equal(messages(result).model, 'Select a model offered by the chosen provider.');
});

test('agentProviderConfigSchema does not turn a missing temperature into a value', () => {
  const { temperature: _omitted, ...withoutTemperature } = validSettings;
  assert.ok(messages(agentProviderConfigSchema.safeParse(withoutTemperature)).temperature);
});

const validAgentConfiguration = {
  name: 'Treasury Rebalancer',
  description: '',
  provider: 'Nvidia',
  model: 'meta/llama-3.1-405b-instruct',
  endpointUrl: '',
  mode: 'assisted',
  temperature: 0.2,
  monthlyBudget: 500,
  dailySpendingLimit: 100,
  capabilities: ['wallet.read'],
} as const;

test('agentConfigurationSchema accepts a valid configuration with scopes and limits', () => {
  assert.equal(agentConfigurationSchema.safeParse(validAgentConfiguration).success, true);
});

test('agentConfigurationSchema enforces the provider model catalog and endpoint', () => {
  const modelResult = messages(
    agentConfigurationSchema.safeParse({
      ...validAgentConfiguration,
      model: 'claude-3-5-sonnet-latest',
    }),
  );
  assert.ok(modelResult.model);

  const endpointResult = messages(
    agentConfigurationSchema.safeParse({
      ...validAgentConfiguration,
      provider: 'Custom',
      model: 'my-model',
    }),
  );
  assert.ok(endpointResult.endpointUrl);
});

test('agentConfigurationSchema keeps the daily limit within the monthly budget', () => {
  const result = messages(
    agentConfigurationSchema.safeParse({
      ...validAgentConfiguration,
      dailySpendingLimit: 501,
    }),
  );
  assert.equal(result.dailySpendingLimit, 'Daily spending limit cannot exceed the monthly budget.');
});

test('agentConfigurationSchema requires at least one permission scope', () => {
  const result = messages(
    agentConfigurationSchema.safeParse({
      ...validAgentConfiguration,
      capabilities: [],
    }),
  );
  assert.equal(result.capabilities, 'Grant at least one permission scope.');
});
