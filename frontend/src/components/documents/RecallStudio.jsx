import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, Play, Pause, Sparkles } from 'lucide-react';
import DocumentQuizService from '../../services/documentQuiz';
import LlmConfigPanel from '@/components/ai/LlmConfigPanel';
import { LLM_PROVIDER_OPTIONS, MODEL_PRESETS } from '@/lib/llm-options';


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
    const [answerFile, setAnswerFile] = useState(null);
    const [batchGradeResult, setBatchGradeResult] = useState(null);
    const [batchGrading, setBatchGrading] = useState(false);
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
            if (mode === 'exercise') {
                const preview = await DocumentQuizService.previewExercises(documentId, {
                    source_mode: sourceMode,
                    selection_text: sourceMode === 'selection' ? selectedText : null,
                    use_llm: false,
                    llm_config: settings.llm_config
                });
                const itemsToCreate = (preview || []).slice(0, count).map((item) => ({
                    text: item.text,
                    question_number: item.question_number,
                    page_start: item.page_start,
                    page_end: item.page_end
                }));
                const created = await DocumentQuizService.createExercises(documentId, { items: itemsToCreate, mode: 'exercise' });
                setItems(created || []);
                if (created && created.length > 0) {
                    const sessionResp = await DocumentQuizService.createSession(documentId, {
                        mode: 'exercise',
                        item_ids: created.map(i => i.id),
                        settings: settings.reveal_config
                    });
                    setSession(sessionResp);
                    setActiveItem(sessionResp.items?.[0] || created[0]);
                    setRevealPercent(0);
                    stopReveal();
                }
            } else {
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

    const handleBatchGrade = async () => {
        if (!session || !answerFile) return;
        setBatchGrading(true);
        setBatchGradeResult(null);
        try {
            const formData = new FormData();
            formData.append('session_id', session.id);
            formData.append('file', answerFile);
            formData.append('llm_config_json', JSON.stringify(settings.llm_config || {}));
            const result = await DocumentQuizService.gradeBatch(documentId, formData);
            setBatchGradeResult(result);
        } catch (err) {
            console.error(err);
        } finally {
            setBatchGrading(false);
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
                            <option value="exercise">Exercise Review</option>
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
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] uppercase tracking-widest text-dark-500 font-black">Upload Answer Sheet (Q1/Q2 labels)</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="file"
                                        onChange={(e) => setAnswerFile(e.target.files?.[0] || null)}
                                        className="flex-1 text-[10px] text-dark-400"
                                    />
                                    <button
                                        onClick={handleBatchGrade}
                                        disabled={batchGrading || !answerFile}
                                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest"
                                    >
                                        {batchGrading ? 'Grading...' : 'Grade File'}
                                    </button>
                                </div>
                            </div>
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
                                {gradeResult.alternative_approaches && gradeResult.alternative_approaches.length > 0 && (
                                    <div className="mt-3 text-primary-100/80">
                                        <div className="text-[10px] uppercase tracking-widest font-black text-primary-200 mb-1">Alternative Approaches</div>
                                        <ul className="list-disc list-inside space-y-1">
                                            {gradeResult.alternative_approaches.map((item, idx) => (
                                                <li key={`${item}-${idx}`}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        {batchGradeResult && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                                <div className="text-[10px] uppercase tracking-widest font-black text-dark-400 mb-2">Batch Results</div>
                                <div className="space-y-2">
                                    {(batchGradeResult.items || []).map((item, idx) => (
                                        <div key={`${item.quiz_item_id || idx}`} className="flex items-center justify-between">
                                            <span className="text-dark-300">{item.question_number || `Q${idx + 1}`}</span>
                                            <span className="text-primary-300">
                                                {item.mapped ? `${Math.round((item.score || 0) * 100)}%` : 'Unmapped'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {batchGradeResult.unmapped_text && (
                                    <div className="mt-2 text-[10px] text-rose-300">
                                        Some answers could not be mapped. Ensure Q1/Q2 labels in the upload.
                                    </div>
                                )}
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

                        <LlmConfigPanel
                            value={settings.llm_config}
                            onChange={(next) => setSettings({ ...settings, llm_config: next })}
                            providers={LLM_PROVIDER_OPTIONS}
                            modelPresets={MODEL_PRESETS}
                            onTest={handleTestLlm}
                            testing={testing}
                            testPrompt={testPrompt}
                            onTestPromptChange={setTestPrompt}
                            testResult={testResult}
                            helper="Non-default providers may require an OpenAI-compatible base URL."
                        />

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
