import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, Play, Pause, TestTube, Sparkles } from 'lucide-react';
import DocumentQuizService from '../../services/documentQuiz';

const PROVIDERS = [
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

const MODEL_PRESETS = {
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

const defaultReveal = {
    total_duration_sec: 30,
    step_seconds: 5,
    start_delay_sec: 2,
    reveal_percent_per_step: 12
};

const RecallStudio = ({ documentId, selectedText, initialSessionId }) => {
    const [mode, setMode] = useState('cloze');
    const [sourceMode, setSourceMode] = useState('auto');
    const [count, setCount] = useState(5);
    const [difficulty, setDifficulty] = useState(3);
    const [maxLength, setMaxLength] = useState(450);
    const [items, setItems] = useState([]);
    const [session, setSession] = useState(null);
    const [activeItem, setActiveItem] = useState(null);
    const [answer, setAnswer] = useState('');
    const [grading, setGrading] = useState(false);
    const [gradeResult, setGradeResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [testPrompt, setTestPrompt] = useState('Say hello in one line.');
    const [testResult, setTestResult] = useState(null);
    const [stats, setStats] = useState(null);
    const [testing, setTesting] = useState(false);

    const [settings, setSettings] = useState({
        reveal_config: defaultReveal,
        llm_config: { provider: 'openai', model: '', base_url: '', api_key: '' },
        voice_mode_enabled: false
    });

    const [revealPercent, setRevealPercent] = useState(0);
    const [isRevealing, setIsRevealing] = useState(false);
    const revealTimer = useRef(null);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const data = await DocumentQuizService.getStudySettings(documentId);
                if (mounted) {
                    setSettings({
                        reveal_config: data.reveal_config || defaultReveal,
                        llm_config: data.llm_config || settings.llm_config,
                        voice_mode_enabled: data.voice_mode_enabled || false
                    });
                }
                try {
                    const statData = await DocumentQuizService.getStats(documentId);
                    if (mounted) setStats(statData);
                } catch (err) {
                    console.error(err);
                }

                if (initialSessionId) {
                    const sessionResp = await DocumentQuizService.getSession(documentId, initialSessionId);
                    if (mounted && sessionResp) {
                        setSession(sessionResp);
                        setItems(sessionResp.items || []);
                        setActiveItem(sessionResp.items?.[0] || null);
                        setRevealPercent(0);
                        stopReveal();
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [documentId, initialSessionId]);

    useEffect(() => {
        if (!SpeechRecognition) return;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.interimResults = false;
        recognitionRef.current.onresult = (e) => {
            const result = e.results?.[0]?.[0]?.transcript || '';
            setTranscript(result);
            setAnswer(result);
            setIsListening(false);
        };
        recognitionRef.current.onerror = () => setIsListening(false);
        recognitionRef.current.onend = () => setIsListening(false);
    }, [SpeechRecognition]);

    const startReveal = () => {
        if (!activeItem) return;
        clearInterval(revealTimer.current);
        setRevealPercent(0);
        setIsRevealing(true);
        const { step_seconds, start_delay_sec, reveal_percent_per_step } = settings.reveal_config || defaultReveal;
        let current = 0;
        setTimeout(() => {
            revealTimer.current = setInterval(() => {
                current += reveal_percent_per_step;
                if (current >= 100) {
                    current = 100;
                    clearInterval(revealTimer.current);
                    setIsRevealing(false);
                }
                setRevealPercent(current);
            }, Math.max(1, step_seconds) * 1000);
        }, Math.max(0, start_delay_sec) * 1000);
    };

    const stopReveal = () => {
        clearInterval(revealTimer.current);
        setIsRevealing(false);
    };

    const handleGenerate = async () => {
        setGenerating(true);
        setGradeResult(null);
        try {
            const generated = await DocumentQuizService.generateQuizItems(documentId, {
                mode,
                count,
                max_length: maxLength,
                difficulty,
                source_mode: sourceMode,
                selection_text: sourceMode === 'selection' ? selectedText : null,
                llm_config: settings.llm_config
            });
            setItems(generated || []);
            if (generated && generated.length > 0) {
                const sessionResp = await DocumentQuizService.createSession(documentId, {
                    mode,
                    item_ids: generated.map(i => i.id),
                    settings: settings.reveal_config
                });
                setSession(sessionResp);
                setActiveItem(sessionResp.items?.[0] || generated[0]);
                setRevealPercent(0);
                stopReveal();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setGenerating(false);
        }
    };

    const handleGrade = async () => {
        if (!activeItem || !session) return;
        setGrading(true);
        setGradeResult(null);
        try {
            const result = await DocumentQuizService.gradeItem(documentId, {
                session_id: session.id,
                quiz_item_id: activeItem.id,
                answer_text: answer,
                transcript: transcript || null,
                llm_config: settings.llm_config
            });
            setGradeResult(result);
            try {
                const statData = await DocumentQuizService.getStats(documentId);
                setStats(statData);
            } catch (err) {
                console.error(err);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setGrading(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await DocumentQuizService.saveStudySettings(documentId, settings);
            setSettingsOpen(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleTestLlm = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await DocumentQuizService.testLlm({
                prompt: testPrompt,
                llm_config: settings.llm_config
            });
            setTestResult(result);
        } catch (err) {
            setTestResult({ ok: false, error: err });
        } finally {
            setTesting(false);
        }
    };

    const toggleVoice = () => {
        if (!SpeechRecognition) return;
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            setTranscript('');
            setIsListening(true);
            recognitionRef.current?.start();
        }
    };

    const renderClozeText = (item) => {
        if (!item) return null;
        const masked = item.masked_markdown || item.passage_markdown || '';
        const parts = masked.split(/(\[\[blank_?\d*\]\])/g);
        const passage = item.passage_markdown || '';
        const revealLen = Math.floor((revealPercent / 100) * passage.length);
        const visible = passage.slice(0, revealLen);
        const hidden = passage.slice(revealLen);
        return (
            <div className="space-y-3">
                <div className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
                    {parts.map((part, idx) => {
                        if (part.startsWith('[[blank')) {
                            return <span key={idx} className="inline-block px-2 py-0.5 mx-0.5 rounded bg-white/10 text-white/20">____</span>;
                        }
                        return <span key={idx}>{part}</span>;
                    })}
                </div>
                {revealPercent > 0 && (
                    <div className="text-[11px] text-white/70 whitespace-pre-wrap">
                        <span className="text-white">{visible}</span>
                        <span className="text-white/20">{hidden}</span>
                    </div>
                )}
            </div>
        );
    };

    const renderRevealText = (item) => {
        if (!item) return null;
        const passage = item.passage_markdown || '';
        const revealLen = Math.floor((revealPercent / 100) * passage.length);
        const visible = passage.slice(0, revealLen);
        const hidden = passage.slice(revealLen);
        return (
            <div className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
                <span className="text-white">{visible}</span>
                <span className="text-white/20">{hidden}</span>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 bg-dark-900/80 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary-500/10 text-primary-300">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-xs font-black uppercase tracking-widest text-white/80">Recall Studio</div>
                        <div className="text-[10px] text-dark-400">Cloze + semantic recall with timed reveal</div>
                    </div>
                </div>
                <button onClick={() => setSettingsOpen(true)} className="text-[10px] font-bold uppercase tracking-widest text-dark-400 hover:text-white">
                    Settings
                </button>
            </div>

            <div className="p-4 space-y-4 overflow-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-900/60 border border-white/5 rounded-2xl p-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Source</label>
                        <select value={sourceMode} onChange={(e) => setSourceMode(e.target.value)} className="mt-2 w-full bg-dark-950 border border-white/5 rounded-xl px-3 py-2 text-xs">
                            <option value="auto">Full Document</option>
                            <option value="selection">Selected Text</option>
                        </select>
                        {sourceMode === "selection" && (!selectedText || selectedText.trim().length < 20) && (
                            <div className="text-[10px] text-rose-400 mt-2">Select a paragraph in the document first.</div>
                        )}
                    </div>

                    <div className="bg-dark-900/60 border border-white/5 rounded-2xl p-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Mode</label>
                        <select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-2 w-full bg-dark-950 border border-white/5 rounded-xl px-3 py-2 text-xs">
                            <option value="cloze">Cloze Recall</option>
                            <option value="recall">Semantic Recall</option>
                        </select>
                    </div>
                    <div className="bg-dark-900/60 border border-white/5 rounded-2xl p-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Items</label>
                        <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 w-full bg-dark-950 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                    </div>
                    <div className="bg-dark-900/60 border border-white/5 rounded-2xl p-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Difficulty</label>
                        <input type="range" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="mt-3 w-full" />
                    </div>
                    <div className="bg-dark-900/60 border border-white/5 rounded-2xl p-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Max Length</label>
                        <input type="number" min={200} max={800} value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} className="mt-2 w-full bg-dark-950 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                    </div>
                </div>

                
                {stats && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-dark-400">
                        <div className="bg-dark-900/60 border border-white/5 rounded-xl p-2">Total attempts: <span className="text-white">{stats.total_attempts}</span></div>
                        <div className="bg-dark-900/60 border border-white/5 rounded-xl p-2">Average score: <span className="text-white">{Math.round((stats.average_score || 0) * 100)}%</span></div>
                        <div className="bg-dark-900/60 border border-white/5 rounded-xl p-2">Best score: <span className="text-white">{Math.round((stats.best_score || 0) * 100)}%</span></div>
                        <div className="bg-dark-900/60 border border-white/5 rounded-xl p-2">Last 7d: <span className="text-white">{stats.attempts_last_7d}</span></div>
                        <div className="bg-dark-900/60 border border-white/5 rounded-xl p-2 col-span-2">Last attempt: <span className="text-white">{stats.last_attempt_at ? new Date(stats.last_attempt_at).toLocaleString() : "—"}</span></div>
                    </div>
                )}

                <button onClick={handleGenerate} disabled={generating || (sourceMode === "selection" && (!selectedText || selectedText.trim().length < 20))} className="w-full py-3 rounded-2xl bg-primary-600/20 border border-primary-500/40 text-primary-200 font-black text-xs uppercase tracking-widest hover:bg-primary-500/30 transition-all">
                    {generating ? 'Generating...' : 'Generate Recall Set'}
                </button>

                {items.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                        {items.map((item, idx) => (
                            <button
                                key={item.id}
                                onClick={() => { setActiveItem(item); setRevealPercent(0); stopReveal(); setGradeResult(null); }}
                                className={`text-[10px] uppercase tracking-widest py-2 rounded-xl border ${activeItem?.id === item.id ? 'border-primary-500/50 text-primary-300 bg-primary-500/10' : 'border-white/5 text-dark-400 bg-dark-900/40'}`}
                            >
                                Item {idx + 1}
                            </button>
                        ))}
                    </div>
                )}

                {activeItem && (
                    <div className="bg-dark-900/60 border border-white/5 rounded-2xl p-4 space-y-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-dark-500">Timed Reveal</div>
                        <div className="bg-dark-950/80 border border-white/5 rounded-2xl p-4">
                            {mode === "cloze" ? renderClozeText(activeItem) : renderRevealText(activeItem)}
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={isRevealing ? stopReveal : startReveal} className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest">
                                {isRevealing ? <Pause className="w-3 h-3 inline-block mr-2" /> : <Play className="w-3 h-3 inline-block mr-2" />} 
                                {isRevealing ? 'Pause' : 'Start'}
                            </button>
                            <button onClick={() => setRevealPercent(100)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest">Reveal Now</button>
                            <div className="text-[10px] text-dark-400">{Math.round(revealPercent)}%</div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-dark-500">Your Recall</div>
                            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="w-full bg-dark-950 border border-white/5 rounded-2xl p-3 text-xs min-h-[110px]" placeholder="Type what you recall..." />
                            <div className="flex items-center gap-2">
                                <button onClick={handleGrade} disabled={grading} className="px-4 py-2 rounded-xl bg-primary-500/20 border border-primary-500/40 text-primary-200 text-xs font-black uppercase tracking-widest">
                                    {grading ? 'Grading...' : 'Grade Recall'}
                                </button>
                                {SpeechRecognition && settings.voice_mode_enabled && (
                                    <button onClick={toggleVoice} className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest">
                                        {isListening ? <MicOff className="w-3 h-3 inline-block mr-2" /> : <Mic className="w-3 h-3 inline-block mr-2" />}
                                        {isListening ? 'Stop' : 'Voice'}
                                    </button>
                                )}
                                {!SpeechRecognition && settings.voice_mode_enabled && (
                                    <span className="text-[10px] text-rose-400">Voice not supported in this browser</span>
                                )}
                            </div>
                        </div>

                        {gradeResult && (
                            <div className="rounded-2xl border border-primary-500/30 bg-primary-500/10 p-3 text-xs">
                                <div className="font-bold text-primary-300">Score: {Math.round((gradeResult.score || 0) * 100)}%</div>
                                <div className="text-primary-100/80 mt-1">{gradeResult.feedback}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {settingsOpen && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="w-full max-w-2xl bg-dark-950 border border-white/10 rounded-3xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-black uppercase tracking-widest text-white">Study Settings</div>
                            <button onClick={() => setSettingsOpen(false)} className="text-dark-400 text-xs uppercase tracking-widest">Close</button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Provider</label>
                                <select value={settings.llm_config.provider} onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, provider: e.target.value } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs">
                                    {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <div className="text-[10px] text-dark-500 mt-1">Non-default providers require OpenAI-compatible base URL.</div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Model</label>
                                <input value={settings.llm_config.model || ''} onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, model: e.target.value } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" placeholder="gpt-4o, llama3, qwen" />
                                <select onChange={(e) => e.target.value && setSettings({ ...settings, llm_config: { ...settings.llm_config, model: e.target.value } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-[10px] text-dark-300">
                                    <option value="">Model presets (examples)</option>
                                    {(MODEL_PRESETS[settings.llm_config.provider] || []).map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Base URL</label>
                                <input value={settings.llm_config.base_url || ''} onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, base_url: e.target.value } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" placeholder="https://..." />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">API Key</label>
                                <input type="password" value={settings.llm_config.api_key || ''} onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, api_key: e.target.value } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" placeholder="sk-..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Reveal Duration (sec)</label>
                                <input type="number" value={settings.reveal_config.total_duration_sec || 30} onChange={(e) => setSettings({ ...settings, reveal_config: { ...settings.reveal_config, total_duration_sec: Number(e.target.value) } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Step Seconds</label>
                                <input type="number" value={settings.reveal_config.step_seconds || 5} onChange={(e) => setSettings({ ...settings, reveal_config: { ...settings.reveal_config, step_seconds: Number(e.target.value) } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Start Delay</label>
                                <input type="number" value={settings.reveal_config.start_delay_sec || 2} onChange={(e) => setSettings({ ...settings, reveal_config: { ...settings.reveal_config, start_delay_sec: Number(e.target.value) } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Reveal % / Step</label>
                                <input type="number" value={settings.reveal_config.reveal_percent_per_step || 12} onChange={(e) => setSettings({ ...settings, reveal_config: { ...settings.reveal_config, reveal_percent_per_step: Number(e.target.value) } })} className="mt-2 w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                            </div>
                        </div>

                        <label className="flex items-center gap-3 text-xs text-dark-300">
                            <input type="checkbox" checked={settings.voice_mode_enabled} onChange={(e) => setSettings({ ...settings, voice_mode_enabled: e.target.checked })} />
                            Enable voice recall mode (browser speech recognition)
                        </label>

                        <div className="border border-white/5 rounded-2xl p-4 space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-dark-500">Test LLM</div>
                            <input value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} className="w-full bg-dark-900 border border-white/5 rounded-xl px-3 py-2 text-xs" />
                            <button onClick={handleTestLlm} disabled={testing} className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest">
                                {testing ? <Loader2 className="w-3 h-3 animate-spin inline-block mr-2" /> : <TestTube className="w-3 h-3 inline-block mr-2" />}Test
                            </button>
                            {testResult && (
                                <div className="text-[10px] text-dark-400">{testResult.output_sample || testResult.error}</div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setSettingsOpen(false)} className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest">Cancel</button>
                            <button onClick={handleSaveSettings} className="px-4 py-2 rounded-xl bg-primary-500/20 border border-primary-500/40 text-xs font-bold uppercase tracking-widest">Save Settings</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecallStudio;
