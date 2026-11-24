'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Copy, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, Input, Select, Textarea } from '@/components/ui/input';
import {
  providerModelOptions,
  agentProviderTypes,
  type AgentProviderType,
} from '@/lib/validations/agent';
import {
  SYSTEM_PROMPT_TEMPLATES,
  getSystemPromptTemplateById,
} from '@/features/agents/systemPromptTemplates';
import {
  agentConfigPanelSchema,
  type AgentConfigPanelValues,
} from '@/features/agents/schema';

const PROVIDER_LABELS: Record<AgentProviderType, string> = {
  nvidia: 'Nvidia',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
  custom: 'Custom',
};

export interface AgentConfigPanelProps {
  defaultValues?: Partial<AgentConfigPanelValues>;
  onSubmit?: (values: AgentConfigPanelValues) => void | Promise<void>;
  className?: string;
}

/**
 * Agent configuration panel with dynamic model selection, behavior settings,
 * and system prompt templates. Prevents unrelated inputs from clearing when
 * the provider changes — only the model field resets to the default for the
 * newly selected provider.
 */
export function AgentConfigPanel({
  defaultValues,
  onSubmit,
  className,
}: AgentConfigPanelProps) {
  const form = useForm<AgentConfigPanelValues>({
    resolver: zodResolver(agentConfigPanelSchema),
    defaultValues: {
      provider: 'openai',
      model: providerModelOptions.openai[0] ?? '',
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: '',
      systemPromptTemplate: '',
      ...defaultValues,
    },
    mode: 'onChange',
  });

  const provider = form.watch('provider');
  const modelOptions = providerModelOptions[provider];
  const systemPromptTemplate = form.watch('systemPromptTemplate');

  // When provider changes, reset only the model to the first available for that provider
  useEffect(() => {
    form.setValue('model', modelOptions[0] ?? '', { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // When a system prompt template is selected, populate the systemPrompt field
  // but allow the user to override or customize it afterward
  useEffect(() => {
    if (systemPromptTemplate) {
      const template = getSystemPromptTemplateById(systemPromptTemplate);
      if (template) {
        form.setValue('systemPrompt', template.prompt, { shouldValidate: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemPromptTemplate]);

  const handleSubmit = async (values: AgentConfigPanelValues) => {
    try {
      await onSubmit?.(values);
      toast.success('Agent configuration saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration.';
      toast.error(message);
    }
  };

  // Compute temperature percentage for visual feedback (0 to 100%)
  const temperaturePercent = (form.watch('temperature') / 2) * 100;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="h-4 w-4 text-gold" aria-hidden />
          Agent configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6"
          noValidate
        >
          {/* Provider & Model Section */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Model Selection
            </legend>

            <FormField
              label="Provider"
              htmlFor="config-provider"
              required
              error={form.formState.errors.provider?.message}
            >
              <Select
                id="config-provider"
                {...form.register('provider')}
                invalid={Boolean(form.formState.errors.provider)}
              >
                {agentProviderTypes.map((value) => (
                  <option key={value} value={value}>
                    {PROVIDER_LABELS[value]}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Model"
              htmlFor="config-model"
              required
              error={form.formState.errors.model?.message}
            >
              {modelOptions.length > 0 ? (
                <Select
                  id="config-model"
                  {...form.register('model')}
                  invalid={Boolean(form.formState.errors.model)}
                >
                  {modelOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="config-model"
                  {...form.register('model')}
                  placeholder="e.g. llama3.1:70b"
                  invalid={Boolean(form.formState.errors.model)}
                />
              )}
            </FormField>
          </fieldset>

          {/* Behavior Settings Section */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Behavior Settings
            </legend>

            <FormField
              label="Temperature"
              htmlFor="config-temperature"
              error={form.formState.errors.temperature?.message}
              hint="0 = deterministic, 2 = most creative"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    id="config-temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    {...form.register('temperature', {
                      valueAsNumber: true,
                    })}
                    className="h-2 w-full cursor-pointer rounded-full bg-border appearance-none accent-gold"
                    aria-valuemin={0}
                    aria-valuemax={2}
                    aria-valuenow={form.watch('temperature')}
                  />
                  <span className="w-12 text-right text-sm font-medium text-foreground">
                    {form.watch('temperature').toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-2xs text-foreground-secondary">
                  <span className="w-12">Precise</span>
                  <div
                    className="h-1 flex-1 rounded-full bg-gradient-to-r from-success to-warning"
                    style={{ opacity: temperaturePercent / 100 }}
                    aria-hidden
                  />
                  <span className="w-12 text-right">Creative</span>
                </div>
              </div>
            </FormField>

            <FormField
              label="Max Tokens"
              htmlFor="config-max-tokens"
              required
              error={form.formState.errors.maxTokens?.message}
              hint="Maximum tokens per response"
            >
              <Input
                id="config-max-tokens"
                type="number"
                min="1"
                step="256"
                {...form.register('maxTokens', { valueAsNumber: true })}
                invalid={Boolean(form.formState.errors.maxTokens)}
              />
            </FormField>
          </fieldset>

          {/* System Prompt Section */}
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold text-foreground uppercase tracking-wide">
              System Prompt
            </legend>

            <FormField
              label="Use a template"
              htmlFor="config-template"
              hint="Auto-populate with a preset; customize below"
            >
              <Select
                id="config-template"
                {...form.register('systemPromptTemplate')}
                defaultValue=""
              >
                <option value="">No template</option>
                {SYSTEM_PROMPT_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} — {template.category}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="System Prompt"
              htmlFor="config-system-prompt"
              required
              error={form.formState.errors.systemPrompt?.message}
              hint="Define the agent's behavior and constraints"
            >
              <Textarea
                id="config-system-prompt"
                {...form.register('systemPrompt')}
                placeholder="You are an autonomous trading agent..."
                invalid={Boolean(form.formState.errors.systemPrompt)}
                className="font-mono text-xs"
              />
            </FormField>

            {/* Copy to clipboard helper */}
            {form.watch('systemPrompt') && (
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={<Copy className="h-3 w-3" aria-hidden />}
                  onClick={() => {
                    navigator.clipboard.writeText(form.watch('systemPrompt'));
                    toast.success('Prompt copied to clipboard.');
                  }}
                >
                  Copy prompt
                </Button>
              </div>
            )}
          </fieldset>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="submit" variant="gold">
              Save configuration
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default AgentConfigPanel;
