import React from 'react';
import { TestTube, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FormRow from '@/components/ui/form-row';
import { cn } from '@/lib/utils';

const LlmConfigPanel = ({
    title = 'LLM Settings',
    value,
    onChange,
    providers = [],
    modelPresets = {},
    onTest,
    testing = false,
    testPrompt,
    onTestPromptChange,
    testResult,
    showTest = true,
    showPrompt = true,
    helper,
    className
}) => {
    const providerValue = value?.provider || 'openai';
    const presets = modelPresets?.[providerValue] || [];

    const update = (field, next) => {
        if (!onChange) return;
        onChange({ ...(value || {}), [field]: next });
    };

    return (
        <div className={cn('rounded-2xl border border-white/10 bg-dark-950/50 p-4 space-y-4', className)}>
            <div>
                <div className="text-[10px] uppercase tracking-widest text-dark-400 font-semibold">{title}</div>
                {helper && <div className="mt-1 text-[11px] text-dark-400">{helper}</div>}
            </div>

            <div className="grid grid-cols-1 gap-4">
                <FormRow label="Provider">
                    <Select value={providerValue} onValueChange={(val) => update('provider', val)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                            {providers.map((provider) => (
                                <SelectItem key={provider.value} value={provider.value}>
                                    {provider.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FormRow>

                <FormRow label="Model">
                    <Input
                        value={value?.model || ''}
                        onChange={(e) => update('model', e.target.value)}
                        placeholder="e.g. gpt-4o-mini"
                    />
                    {presets.length > 0 && (
                        <Select value="" onValueChange={(val) => update('model', val)}>
                            <SelectTrigger className="mt-2 w-full">
                                <SelectValue placeholder="Model presets (examples)" />
                            </SelectTrigger>
                            <SelectContent>
                                {presets.map((model) => (
                                    <SelectItem key={model} value={model}>
                                        {model}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </FormRow>

                <FormRow label="Base URL" helper="For OpenAI-compatible providers (optional).">
                    <Input
                        value={value?.base_url || ''}
                        onChange={(e) => update('base_url', e.target.value)}
                        placeholder="https://..."
                    />
                </FormRow>

                <FormRow label="API Key">
                    <Input
                        type="password"
                        value={value?.api_key || ''}
                        onChange={(e) => update('api_key', e.target.value)}
                        placeholder="sk-..."
                    />
                </FormRow>
            </div>

            {showTest && (
                <div className="rounded-2xl border border-white/10 bg-dark-900/40 p-3 space-y-3">
                    <div className="text-[10px] uppercase tracking-widest text-dark-400 font-semibold">Test LLM</div>
                    {showPrompt && (
                        <Input
                            value={testPrompt || ''}
                            onChange={(e) => onTestPromptChange?.(e.target.value)}
                            placeholder="Say hello in one line."
                        />
                    )}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onTest}
                            disabled={testing}
                        >
                            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                            {testing ? 'Testing...' : 'Test'}
                        </Button>
                        {testResult && (
                            <div className="text-[11px] text-dark-300">
                                {testResult.output_sample || testResult.error || (testResult.ok ? 'OK' : 'Failed')}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LlmConfigPanel;
