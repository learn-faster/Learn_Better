export function parseApiError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const detailObj = data?.detail && typeof data.detail === 'object' && !Array.isArray(data.detail)
    ? data.detail
    : null;
  let detail = data?.detail ?? data?.message ?? error?.message ?? 'An unexpected error occurred';

  if (Array.isArray(detail)) {
    detail = detail
      .map((item) => {
        const loc = Array.isArray(item?.loc) ? item.loc.slice(1).join('.') : 'field';
        const msg = item?.msg || item?.message || 'Invalid value';
        return `${loc}: ${msg}`;
      })
      .join('; ');
  } else if (detail && typeof detail === 'object') {
    try {
      detail = JSON.stringify(detail);
    } catch {
      detail = 'An unexpected error occurred';
    }
  }

  let message = typeof detail === 'string' ? detail : 'An unexpected error occurred';
  let hint = null;

  const rawMessage = String(message || '').toLowerCase();
  const normalized = rawMessage
    .replace(/failed to\s+/g, '')
    .replace(/error:\s*/g, '')
    .trim();

  const mappings = [
    {
      test: () => detailObj?.code === 'EMBEDDING_DIMENSION_MISMATCH',
      message: 'Embedding dimensions are incompatible.',
      hint: 'Open Settings, set embedding dimensions to match your vector index, then reindex embeddings.'
    },
    {
      test: (m) => /expected\s+\d+\s+dimensions?,?\s+not\s+\d+/.test(m),
      message: 'Embedding dimensions are incompatible.',
      hint: 'Your DB vector index dimension does not match model output. Use mixed-dimension migration or reindex after alignment.'
    },
    {
      test: (m) => m.includes('missing api key') || m.includes('api key is required'),
      message: 'Missing API key.',
      hint: 'Add it in Settings.'
    },
    {
      test: (m) => m.includes('missing base url') || m.includes('base url'),
      message: 'Missing base URL.',
      hint: 'Set the base URL in Settings.'
    },
    {
      test: (m) => m.includes('not found') && (m.includes('llm') || m.includes('endpoint') || m.includes('model')),
      message: 'LLM endpoint not found.',
      hint: 'Check provider, base URL, and model.'
    },
    {
      test: (m) => m.includes('rate limit') || m.includes('too many requests'),
      message: 'Rate limit exceeded.',
      hint: 'Wait a moment and try again.'
    },
    {
      test: (m) => m.includes('unauthorized') || m.includes('permission denied') || m.includes('authentication'),
      message: 'Authentication failed.',
      hint: 'Check your API key.'
    },
    {
      test: (m) => m.includes('connection') || m.includes('connecterror') || m.includes('ecconnrefused') || m.includes('enotfound'),
      message: 'Cannot reach the server.',
      hint: 'Check the backend URL and network.'
    },
    {
      test: (m) => m.includes('timeout'),
      message: 'Request timed out.',
      hint: 'Try again or reduce the workload.'
    }
  ];

  for (const entry of mappings) {
    if (entry.test(normalized)) {
      message = entry.message;
      hint = entry.hint;
      break;
    }
  }

  if (status === 422) {
    hint = 'Please check the highlighted fields and try again.';
  } else if (status === 413) {
    hint = 'The uploaded file is too large. Try a smaller file.';
  } else if (status === 401) {
    hint = 'Please sign in again.';
  } else if (rawMessage.includes('network error') || rawMessage.includes('connection') || error?.code === 'ERR_NETWORK') {
    hint = 'Unable to reach the server. Check that the backend is running and reachable.';
  } else if (rawMessage.includes('timeout')) {
    hint = 'The request timed out. Try again or reduce the workload.';
  }

  const trimmedMessage = String(message || '').replace(/\s+/g, ' ').trim();
  const maxLen = 180;
  const shortMessage = trimmedMessage.length > maxLen ? `${trimmedMessage.slice(0, maxLen - 3)}...` : trimmedMessage;

  return { message: shortMessage, hint, status };
}

export function formatApiErrorMessage(error) {
  const { message, hint } = parseApiError(error);
  return hint ? `${message} ${hint}` : message;
}
