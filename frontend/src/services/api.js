import axios from 'axios';
import { getApiUrl } from '../lib/config';
import { formatApiErrorMessage, parseApiError } from '../lib/utils/api-error';
import { toast } from 'sonner';

/**
 * Global Axios instance for API communication.
 * Configures the base URL for the backend and provides 
 * standardized response/error handling via interceptors.
 */
export const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || ''; // Legacy fallback

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(async (config) => {
    try {
        const apiUrl = await getApiUrl();
        const base = apiUrl ? apiUrl.replace(/\/$/, '') : '';
        config.baseURL = base ? `${base}/api` : '/api';
    } catch {
        config.baseURL = '/api';
    }

    const provider = localStorage.getItem('llm_provider');
    const apiKey = localStorage.getItem('llm_api_key');
    const baseUrl = localStorage.getItem('ollama_base_url');
    const model = localStorage.getItem('llm_model');

    if (provider) config.headers['X-LLM-Provider'] = provider;
    if (apiKey) config.headers['X-LLM-Key'] = apiKey;
    if (baseUrl) config.headers['X-LLM-Base-Url'] = baseUrl;
    if (model) config.headers['X-LLM-Model'] = model;
    // Single-user mode: no user ID header.

    return config;
});

/**
 * Response Interceptor:
 * Extracts data payload directly on success.
 * Formats backend error messages (FastAPI 'detail') for easier consumption by UI.
 */
api.interceptors.response.use(
    (response) => {
        try {
            const traceId = response?.headers?.["x-opik-trace-id"];
            if (traceId) localStorage.setItem("opik_last_trace_id", traceId);
            const project = response?.headers?.["x-opik-project"];
            if (project) localStorage.setItem("opik_project", project);
        } catch (err) {
            void err;
        }
        return response.data;
    },
    (error) => {
        const { message, hint, status } = parseApiError(error);
        const formatted = formatApiErrorMessage(error);
        console.error('API Error:', formatted);

        const shouldToast = !error?.config?.headers?.['X-Silent-Error'];
        if (shouldToast) {
            toast.error('Request failed', { description: formatted });
        }

        const err = new Error(message);
        err.userMessage = formatted;
        err.status = status;
        err.hint = hint;
        err.raw = error;
        return Promise.reject(err);
    }
);

export default api;
