import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import { agentApi } from '../../services/agent';
import cognitiveService from '../../services/cognitive';
import useLLMConfig from '../../hooks/useLLMConfig';
import { LLM_PROVIDERS } from '../../lib/llmProviders';
import { motion } from 'framer-motion';
import CelestialBackground from './CelestialBackground';
import SolarCoreIcon from './SolarCoreIcon';

const AgentWelcome = ({ onStart, onSkip }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Welcome aboard. What do you want to learn next?' }
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');

  const {
    provider,
    apiKey,
    ollamaUrl,
    baseUrl,
    model,
    isConfigured,
    isLoaded,
    saveConfig,
    setProvider,
    setApiKey,
    setOllamaUrl,
    setBaseUrl,
    setModel
  } = useLLMConfig();

  useEffect(() => {
    if (provider === 'ollama' || provider === 'ollama_cloud') {
      setBaseUrl(ollamaUrl);
    }
  }, [provider, ollamaUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let animationId = 0;
    const stars = Array.from({ length: 150 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.8 + 0.2,
      speed: Math.random() * 0.6 + 0.2
    }));

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawShip = (time) => {
      const t = time * 0.001;
      const shipX = width * (0.3 + 0.2 * Math.sin(t * 0.2));
      const shipY = height * 0.35 + Math.sin(t * 1.8) * 18;

      ctx.save();
      ctx.translate(shipX, shipY);
      ctx.rotate(Math.sin(t * 0.6) * 0.05);

      ctx.fillStyle = 'rgba(251,191,36,0.18)';
      ctx.beginPath();
      ctx.ellipse(-70, 6, 60, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createLinearGradient(-40, 0, 70, 0);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#f59e0b');
      grad.addColorStop(1, '#fbbf24');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-40, -16);
      ctx.lineTo(52, 0);
      ctx.lineTo(-40, 16);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(-8, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(251,191,36,0.8)';
      ctx.beginPath();
      ctx.moveTo(-55, -6);
      ctx.lineTo(-78, 0);
      ctx.lineTo(-55, 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      const trail = ctx.createLinearGradient(shipX - 140, shipY, shipX - 20, shipY);
      trail.addColorStop(0, 'rgba(251,191,36,0)');
      trail.addColorStop(1, 'rgba(251,191,36,0.45)');
      ctx.strokeStyle = trail;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(shipX - 140, shipY + 6);
      ctx.lineTo(shipX - 30, shipY + 6);
      ctx.stroke();
    };

    const loop = (time) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(5, 8, 18, 0.6)';
      ctx.fillRect(0, 0, width, height);

      stars.forEach((s) => {
        s.x += s.speed * 0.0006;
        if (s.x > 1.1) s.x = -0.1;
        const px = s.x * width;
        const py = s.y * height;
        const size = s.z * 2;
        ctx.fillStyle = `rgba(255,241,214,${0.35 + s.z * 0.5})`;
        ctx.fillRect(px, py, size, size);
      });

      drawShip(time);
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsSending(true);
    try {
      const data = await agentApi.chat({ message: text });
      setMessages((prev) => [...prev, { role: 'assistant', content: data?.message || 'Got it.' }]);
    } catch (e) {
      setError(e?.userMessage || e?.message || 'Unable to reach the Goal Agent. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const needsBaseUrl = provider === 'ollama' || provider === 'ollama_cloud' || provider === 'custom' || ['openrouter','together','fireworks','mistral','deepseek','perplexity','huggingface'].includes(provider);
  const needsApiKey = provider !== 'ollama';
  const effectiveBaseUrl = provider === 'ollama' || provider === 'ollama_cloud' ? ollamaUrl : baseUrl;

  const handleActivateCore = async () => {
    setConfigError('');
    setIsSavingConfig(true);
    try {
      saveConfig({
        provider,
        apiKey,
        ollamaUrl: provider === 'ollama' || provider === 'ollama_cloud' ? ollamaUrl : undefined,
        baseUrl: provider === 'ollama' || provider === 'ollama_cloud' ? undefined : baseUrl,
        model
      });
      const llmConfig = {
        provider,
        api_key: apiKey,
        model,
        ...(needsBaseUrl ? { base_url: effectiveBaseUrl } : {})
      };
      await agentApi.saveSettings({ llm_config: llmConfig });
      await cognitiveService.updateSettings({ llm_config: llmConfig });
    } catch (e) {
      setConfigError(e?.userMessage || e?.message || 'Unable to save LLM config.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-dark-950/95 backdrop-blur-2xl overflow-hidden">
      <CelestialBackground className="absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-orange-500/20" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_10%,rgba(251,191,36,0.25),transparent_40%),radial-gradient(circle_at_70%_20%,rgba(245,158,11,0.25),transparent_45%)]" />

      <div className="relative z-10 h-full w-full px-6 py-8">
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-auto z-20">
          <div className="flex items-center gap-3 rounded-full border border-amber-500/20 bg-dark-900/60 px-4 py-2 backdrop-blur-xl">
            <div className="h-8 w-8 rounded-full flex items-center justify-center">
              <SolarCoreIcon size={28} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300 font-black">Goal Agent</p>
              <p className="text-[10px] text-dark-400">Mission briefing online.</p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="text-xs font-semibold text-amber-100 hover:text-white transition-colors px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.25)]"
          >
            Skip
          </button>
        </div>

        <div ref={containerRef} className="absolute inset-0 pointer-events-none">
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-6">
            <p className="text-[10px] uppercase tracking-[0.4em] text-amber-200/70 font-black">Mission Control</p>
            <h1 className="text-4xl md:text-5xl font-black text-white mt-3">
              Chart your learning trajectory
            </h1>
            <p className="text-dark-300 mt-3 max-w-2xl">
              Tell me your mission. I’ll build your plan, checkpoints, and pace.
            </p>
          </div>

          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="mb-6 flex items-center justify-center"
          >
            <div className="relative w-[140px] h-[140px]">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-amber-500/30"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-3 rounded-full border border-amber-500/20"
              />
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-300/40 to-orange-500/30 border border-amber-500/50 shadow-[0_0_40px_rgba(251,191,36,0.5)] flex items-center justify-center">
                  <SolarCoreIcon size={56} />
                </div>
              </motion.div>
            </div>
          </motion.div>

          {!isLoaded ? (
            <div className="w-full max-w-2xl rounded-[2.5rem] border border-amber-500/20 bg-dark-900/70 backdrop-blur-xl p-8 text-center text-dark-300">
              Initializing learning core...
            </div>
          ) : !isConfigured ? (
            <div className="w-full max-w-2xl rounded-[2.5rem] border border-amber-500/20 bg-dark-900/70 backdrop-blur-xl p-8 shadow-[0_0_40px_rgba(251,191,36,0.2)]">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.4em] text-amber-200/70 font-black">Mission Preparation</p>
                <h2 className="text-2xl md:text-3xl font-black text-white mt-3">Initialize Learning Core</h2>
                <p className="text-dark-300 mt-3">
                  Select a provider and model to dock the agent.
                </p>
              </div>
              <div className="mt-6 space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.3em] text-amber-200/70 font-black mb-2">Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full rounded-2xl bg-dark-950/80 border border-amber-500/30 text-sm text-white px-4 py-3 focus:border-amber-400/80 focus:ring-2 focus:ring-amber-500/30"
                  >
                    {LLM_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.3em] text-amber-200/70 font-black mb-2">Model</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. gpt-4o-mini"
                    className="w-full rounded-2xl bg-dark-950/80 border border-amber-500/30 text-sm text-white px-4 py-3 focus:border-amber-400/80 focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
                {needsApiKey && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.3em] text-amber-200/70 font-black mb-2">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter API key"
                      className="w-full rounded-2xl bg-dark-950/80 border border-amber-500/30 text-sm text-white px-4 py-3 focus:border-amber-400/80 focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                )}
                {needsBaseUrl && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.3em] text-amber-200/70 font-black mb-2">Base URL</label>
                    <input
                      value={effectiveBaseUrl}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (provider === 'ollama' || provider === 'ollama_cloud') {
                          setOllamaUrl(value);
                        } else {
                          setBaseUrl(value);
                        }
                      }}
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-2xl bg-dark-950/80 border border-amber-500/30 text-sm text-white px-4 py-3 focus:border-amber-400/80 focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>
                )}
                {configError && (
                  <div className="text-xs text-rose-300">{configError}</div>
                )}
                <button
                  onClick={handleActivateCore}
                  disabled={isSavingConfig || (needsApiKey && !apiKey.trim()) || (needsBaseUrl && !effectiveBaseUrl.trim()) || !model.trim()}
                  className="w-full mt-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold uppercase tracking-[0.2em] text-[11px] disabled:opacity-40"
                >
                  {isSavingConfig ? 'Activating...' : 'Activate Core'}
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-3xl rounded-[2.5rem] border border-amber-500/20 bg-dark-900/70 backdrop-blur-xl p-6 shadow-[0_0_40px_rgba(251,191,36,0.2)]">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-300 font-black">
                <Sparkles className="w-3 h-3" /> Interstellar Uplink
              </div>
              <div className="mt-5 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Awaiting mission briefing..."
                  className="w-full pr-12 pl-4 py-4 rounded-2xl bg-dark-950/80 border border-amber-500/30 text-sm text-white placeholder:text-dark-500 focus:border-amber-400/80 focus:ring-2 focus:ring-amber-500/30 resize-none h-[64px] shadow-[0_0_30px_rgba(251,191,36,0.25)]"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isSending}
                  className="absolute right-3 top-3 p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 text-[11px] text-dark-400">
                {isSending ? 'Agent is analyzing...' : 'Awaiting your mission details.'}
              </div>
              {error && (
                <div className="mt-1 text-[11px] text-rose-300">{error}</div>
              )}

              <div className="mt-4 flex items-center justify-between text-[10px] text-dark-400">
                <span>Ask a goal, timeframe, or learning focus.</span>
                <button
                  onClick={onStart}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold uppercase tracking-[0.2em] text-[10px]"
                >
                  Start Onboarding <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentWelcome;
