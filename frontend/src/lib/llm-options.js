export const LLM_PROVIDERS = [
    'openai',
    'groq',
    'openrouter',
    'ollama',
    'ollama_cloud',
    'huggingface',
    'together',
    'fireworks',
    'mistral',
    'deepseek',
    'perplexity'
];

export const LLM_PROVIDER_OPTIONS = LLM_PROVIDERS.map((provider) => ({
    value: provider,
    label: provider
}));

export const MODEL_PRESETS = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
    groq: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    openrouter: ['anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash', 'mistralai/mistral-large'],
    ollama: ['llama3', 'qwen2.5', 'mistral'],
    ollama_cloud: ['llama3', 'qwen2.5', 'mistral'],
    together: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    fireworks: ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/qwen2-72b-instruct'],
    mistral: ['mistral-large-latest', 'mistral-small-latest'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    perplexity: ['sonar', 'sonar-pro'],
    huggingface: ['meta-llama/Llama-3.1-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct']
};
