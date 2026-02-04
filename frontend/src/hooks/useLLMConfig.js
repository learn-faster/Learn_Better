import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing LLM configuration with localStorage persistence.
 * Provides centralized access to LLM settings and validation.
 * 
 * @returns {Object} LLM configuration state and helpers.
 */
const useLLMConfig = () => {
    const [provider, setProvider] = useState('groq');
    const [apiKey, setApiKey] = useState('');
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [model, setModel] = useState('qwen/qwen3-32b');
    const [isLoaded, setIsLoaded] = useState(false);

    const refresh = useCallback(() => {
        const savedProvider = localStorage.getItem('llm_provider') || 'groq';
        const savedKey = localStorage.getItem('llm_api_key') || '';
        const savedUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
        const savedModel = localStorage.getItem('llm_model') || 'qwen/qwen3-32b';

        setProvider(savedProvider);
        setApiKey(savedKey);
        setOllamaUrl(savedUrl);
        setModel(savedModel);
    }, []);

    // Load from localStorage on mount
    useEffect(() => {
        refresh();
        setIsLoaded(true);
    }, [refresh]);

    // Check if API key is configured (Ollama doesn't need one)
    const isConfigured = provider === 'ollama' || (apiKey && apiKey.trim().length > 0);

    // Get the full config object for API calls
    const getConfig = useCallback(() => ({
        provider,
        api_key: apiKey,
        base_url: ollamaUrl,
        model
    }), [provider, apiKey, ollamaUrl, model]);

    // Save all settings to localStorage
    const saveConfig = useCallback((newConfig) => {
        const { provider: p, apiKey: k, ollamaUrl: u, model: m } = newConfig;

        if (p !== undefined) {
            setProvider(p);
            localStorage.setItem('llm_provider', p);
        }
        if (k !== undefined) {
            setApiKey(k);
            localStorage.setItem('llm_api_key', k);
        }
        if (u !== undefined) {
            setOllamaUrl(u);
            localStorage.setItem('ollama_base_url', u);
        }
        if (m !== undefined) {
            setModel(m);
            localStorage.setItem('llm_model', m);
        }
    }, []);

    // Quick save just the API key
    const saveApiKey = useCallback((key) => {
        setApiKey(key);
        localStorage.setItem('llm_api_key', key);
    }, []);

    return {
        provider,
        apiKey,
        ollamaUrl,
        model,
        isConfigured,
        isLoaded,
        getConfig,
        saveConfig,
        saveApiKey,
        setProvider,
        setApiKey,
        setOllamaUrl,
        setModel,
        refresh
    };
};

export default useLLMConfig;
