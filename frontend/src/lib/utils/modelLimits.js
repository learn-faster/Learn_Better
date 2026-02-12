const DEFAULT_CONTEXT_TOKENS = 8192;

const MODEL_LIMITS = [
  { provider: 'openai', pattern: /gpt-4o-mini/i, contextTokens: 128000 },
  { provider: 'openai', pattern: /gpt-4o/i, contextTokens: 128000 },
  { provider: 'openai', pattern: /gpt-4-turbo/i, contextTokens: 128000 },
  { provider: 'openai', pattern: /gpt-4\.1/i, contextTokens: 128000 },
  { provider: 'openai', pattern: /gpt-4/i, contextTokens: 8192 },
  { provider: 'openai', pattern: /gpt-3\.5-turbo/i, contextTokens: 4096 },
  { provider: 'anthropic', pattern: /claude-3\.5/i, contextTokens: 200000 },
  { provider: 'anthropic', pattern: /claude-3/i, contextTokens: 200000 },
  { provider: 'google', pattern: /gemini-1\.5/i, contextTokens: 128000 },
  { provider: 'google', pattern: /gemini/i, contextTokens: 128000 },
  { provider: 'mistral', pattern: /mistral/i, contextTokens: 32768 },
  { provider: 'openrouter', pattern: /gpt-4o/i, contextTokens: 128000 },
  { provider: 'openrouter', pattern: /gpt-4/i, contextTokens: 8192 },
  { provider: 'openrouter', pattern: /claude-3\.5/i, contextTokens: 200000 },
  { provider: 'openrouter', pattern: /claude-3/i, contextTokens: 200000 },
  { provider: 'ollama', pattern: /.*/i, contextTokens: DEFAULT_CONTEXT_TOKENS }
];

const normalize = (value) => (value || '').trim().toLowerCase();

export const getContextTokens = (provider, model) => {
  const providerNorm = normalize(provider) || 'openai';
  const modelNorm = normalize(model);
  const match = MODEL_LIMITS.find((entry) => entry.provider === providerNorm && entry.pattern.test(modelNorm));
  if (match) return match.contextTokens;
  const modelOnly = MODEL_LIMITS.find((entry) => entry.pattern.test(modelNorm));
  return modelOnly ? modelOnly.contextTokens : DEFAULT_CONTEXT_TOKENS;
};

export const getRecommendedExtractionSettings = (provider, model, options = {}) => {
  const {
    charPerToken = 4,
    safetyFactor = 0.6,
    minChars = 4000,
    maxCharsCap = 40000,
    chunkRatio = 0.25,
    chunkMin = 600,
    chunkMax = 1600
  } = options;
  const contextTokens = getContextTokens(provider, model);
  const maxInputTokens = Math.floor(contextTokens * safetyFactor);
  const maxInputChars = maxInputTokens * charPerToken;
  const recommendedExtractionMaxChars = Math.max(minChars, Math.min(maxCharsCap, maxInputChars));
  const recommendedChunkSize = Math.floor(Math.max(chunkMin, Math.min(chunkMax, recommendedExtractionMaxChars * chunkRatio)));
  return {
    provider: provider || 'unknown',
    model: model || 'unknown',
    contextTokens,
    maxInputChars,
    recommendedExtractionMaxChars,
    recommendedChunkSize,
    charPerToken,
    safetyFactor
  };
};
