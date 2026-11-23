'use client';

import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Cpu, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import {
  PROVIDER_API_KEY_RULES,
  agentProviderConfigSchema,
  agentProviderTypes,
  isHostedProvider,
  providerModelOptions,
  type AgentProviderConfigValues,
  type AgentProviderType,
} from '@/lib/validations/agent';

const PROVIDER_LABELS: Record<AgentProviderType, string> = {
  nvidia: 'Nvidia',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
  custom: 'Custom',
};

export interface AgentProviderConfigFormProps {
  defaultValues?: Partial<AgentProviderConfigValues>;
  onSubmit?: (values: AgentProviderConfigValues) => void | Promise<void>;
  className?: string;
}

/**
 * Configures an autonomous agent's model provider. Field visibility follows
 * the selected provider: hosted providers (OpenAI, Anthropic, Gemini, Nvidia)
 * need an API key and offer a model dropdown; Ollama and Custom need an
 * endpoint URL instead and accept a free-text model name.
 */
export function AgentProviderConfigForm({
  defaultValues,
  onSubmit,
  className,
}: AgentProviderConfigFormProps) {
  const initialProvider = defaultValues?.provider ?? 'openai';
  const initialModel =
    defaultValues?.model ?? providerModelOptions[initialProvider][0] ?? '';
  const form = useForm<AgentProviderConfigValues>({
    resolver: zodResolver(agentProviderConfigSchema),
    defaultValues: {
      name: '',
      temperature: 0.7,
      endpointUrl: '',
      apiKey: '',
      ...defaultValues,
      provider: initialProvider,
      model: initialModel,
    },
    mode: 'onChange',
  });

  const provider = form.watch('provider');
  const isCustom = provider === 'custom';
  const isHosted = isHostedProvider(provider);
  const modelOptions = providerModelOptions[provider];
  const previousProvider = useRef<AgentProviderType>(provider);

  // Reset the model field to a sane default whenever the provider changes,
  // since model options (and whether it's a dropdown or free text) differ per
  // provider. Do not reset on mount, so a saved model from `defaultValues` is
  // preserved. Hidden fields are cleared so stale validation never blocks submit.
  useEffect(() => {
    if (previousProvider.current === provider) return;
    previousProvider.current = provider;

    form.setValue('model', modelOptions[0] ?? '', { shouldValidate: true });
    if (isHosted) {
      form.setValue('endpointUrl', '', { shouldValidate: false });
    } else {
      form.setValue('apiKey', '', { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // Point each control at its inline error, or at its hint while valid, so
  // screen readers announce the message tied to that specific field.
  const describedBy = (
    id: string,
    field: keyof AgentProviderConfigValues,
    hasHint = false,
  ): string | undefined => {
    if (form.formState.errors[field]) return `${id}-error`;
    return hasHint ? `${id}-hint` : undefined;
  };

  const handleSubmit = async (values: AgentProviderConfigValues) => {
    try {
      await onSubmit?.(values);
      toast.success(`${values.name} provider configuration saved.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save provider configuration.';
      toast.error(message);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="h-4 w-4 text-gold" aria-hidden />
          Agent provider configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-5"
          noValidate
        >
          <FormRow
            id="provider-config-name"
            label="Configuration name"
            required
            error={form.formState.errors.name?.message}
          >
            <Input
              id="provider-config-name"
              {...form.register('name')}
              placeholder="Treasury agent — production"
              invalid={Boolean(form.formState.errors.name)}
              aria-describedby={describedBy('provider-config-name', 'name')}
            />
          </FormRow>

          <FormRow
            id="provider-config-provider"
            label="Provider"
            required
            error={form.formState.errors.provider?.message}
          >
            <Select
              id="provider-config-provider"
              {...form.register('provider')}
              invalid={Boolean(form.formState.errors.provider)}
              aria-describedby={describedBy('provider-config-provider', 'provider')}
            >
              {agentProviderTypes.map((value) => (
                <option key={value} value={value}>
                  {PROVIDER_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormRow>

          <FormRow
            id="provider-config-model"
            label="Model"
            required
            error={form.formState.errors.model?.message}
          >
            {modelOptions.length > 0 ? (
              <Select
                id="provider-config-model"
                {...form.register('model')}
                invalid={Boolean(form.formState.errors.model)}
                aria-describedby={describedBy('provider-config-model', 'model')}
              >
                {modelOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="provider-config-model"
                {...form.register('model')}
                placeholder="e.g. llama3.1:70b"
                invalid={Boolean(form.formState.errors.model)}
                aria-describedby={describedBy('provider-config-model', 'model')}
              />
            )}
          </FormRow>

          {isHosted || isCustom ? (
            <FormRow
              id="provider-config-api-key"
              label="API key"
              required={isHosted}
              error={form.formState.errors.apiKey?.message}
              hint={
                isCustom
                  ? 'Optional — only if your custom endpoint requires bearer auth.'
                  : PROVIDER_API_KEY_RULES[provider]
                    ? `Expected format: ${PROVIDER_API_KEY_RULES[provider]?.example}`
                    : undefined
              }
            >
              <Input
                id="provider-config-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                {...form.register('apiKey')}
                placeholder={
                  isCustom ? 'Optional bearer token' : 'Paste provider API key'
                }
                invalid={Boolean(form.formState.errors.apiKey)}
                aria-describedby={describedBy('provider-config-api-key', 'apiKey', true)}
              />
            </FormRow>
          ) : null}

          {!isHosted ? (
            <FormRow
              id="provider-config-endpoint"
              label="Endpoint URL"
              required
              error={form.formState.errors.endpointUrl?.message}
              hint={
                provider === 'ollama'
                  ? 'Local Ollama server address, e.g. http://localhost:11434'
                  : 'Base URL of the OpenAI-compatible inference server.'
              }
            >
              <Input
                id="provider-config-endpoint"
                type="url"
                inputMode="url"
                {...form.register('endpointUrl')}
                placeholder={
                  provider === 'ollama'
                    ? 'http://localhost:11434'
                    : 'https://api.example.com/v1'
                }
                invalid={Boolean(form.formState.errors.endpointUrl)}
                aria-describedby={describedBy(
                  'provider-config-endpoint',
                  'endpointUrl',
                  provider === 'ollama',
                )}
              />
            </FormRow>
          ) : null}

          <FormRow
            id="provider-config-temperature"
            label="Temperature"
            error={form.formState.errors.temperature?.message}
            hint="0 is deterministic, 2 is most creative."
          >
            <Input
              id="provider-config-temperature"
              type="number"
              step="0.1"
              min={0}
              max={2}
              {...form.register('temperature', { valueAsNumber: true })}
              invalid={Boolean(form.formState.errors.temperature)}
              aria-describedby={describedBy(
                'provider-config-temperature',
                'temperature',
                true,
              )}
            />
          </FormRow>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button
              type="submit"
              variant="gold"
              leftIcon={<Cpu className="h-4 w-4" aria-hidden />}
            >
              Save configuration
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface FormRowProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

/** Labelled field wrapper that ties the label, hint, and error text together for screen readers. */
function FormRow({ id, label, required, error, hint, children }: FormRowProps) {
  return (
    <div className="gap-1.5 flex flex-col">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-2xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-2xs text-foreground-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default AgentProviderConfigForm;
