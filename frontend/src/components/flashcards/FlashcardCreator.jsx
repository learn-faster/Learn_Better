import React, { useState } from 'react';
import { Plus, Check, Loader2, Sparkles, AlertCircle, BrainCircuit, Settings, CheckCircle2 } from 'lucide-react';
import useFlashcardStore from '../../stores/useFlashcardStore';
import useLLMConfig from '../../hooks/useLLMConfig';
import ApiKeySetup from '../ApiKeySetup';
import api from '../../services/api';
import DiscoveryAgent from './DiscoveryAgent';

/**
 * Unified Flashcard Creation Component.
 * 
 * Supports both manual creation and AI-assisted generation from document context.
 * Can be used as a standalone component or integrated into the Document Viewer.
 * Supports React 'ref' to expose submission logic to keyboard shortcuts.
 * 
 * @param {Object} props - Component properties.
 * @param {Object} [props.studyDoc] - The document record being studied.
 * @param {string} [props.selectedText] - Text currently selected in a viewer.
 * @param {Function} [props.onComplete] - Callback after successful creation.
 * @param {string} [props.externalFront] - Controlled value for the front text.
 * @param {string} [props.externalBack] - Controlled value for the back text.
 * @param {Function} [props.setExternalFront] - Setter for external front state.
 * @param {Function} [props.setExternalBack] - Setter for external back state.
 * @returns {JSX.Element} The rendered creator interface.
 */
const FlashcardCreator = React.forwardRef(({ studyDoc, selectedText, onComplete, externalFront, externalBack, setExternalFront, setExternalBack }, ref) => {
    // If external props are provided, use them. Otherwise default to internal state (backwards compatibility)
    const [internalFront, setInternalFront] = useState(selectedText || '');
    const [internalBack, setInternalBack] = useState('');

    // Derived state
    const front = externalFront !== undefined ? externalFront : internalFront;
    const back = externalBack !== undefined ? externalBack : internalBack;
    const setFront = setExternalFront || setInternalFront;
    const setBack = setExternalBack || setInternalBack;

    const [tags, setTags] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [success, setSuccess] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [view, setView] = useState('manual'); // manual, ai

    // AI Context State
    const [startPage, setStartPage] = useState(1);
    const [endPage, setEndPage] = useState(Math.min(5, studyDoc?.page_count || 5));
    const [retrievalMode, setRetrievalMode] = useState('manual_range'); // manual_range, rag
    const [requirements, setRequirements] = useState('');
    const [discoveryProfile, setDiscoveryProfile] = useState(null);

    // Track active selection locally - allows clearing even when prop persists
    const [activeSelection, setActiveSelection] = useState('');

    const documentId = studyDoc?.id;
    const pageCount = studyDoc?.page_count || 0;

    const createFlashcard = useFlashcardStore(state => state.createFlashcard);

    // LLM Config hook for API key validation
    const { isConfigured, isLoaded, getConfig, provider, refresh } = useLLMConfig();
    const [showingSetup, setShowingSetup] = useState(false);

    // Expose submit for keyboard shortcuts
    React.useImperativeHandle(ref, () => ({
        saveCard: () => handleSubmit(new Event('submit'))
    }));

    // Update start/end page if document changes or new upload
    React.useEffect(() => {
        if (pageCount > 0) {
            setEndPage(Math.min(5, pageCount));
        }
    }, [pageCount]);

    // If selected text changes and we are not controlled, update front
    // If controlled, parent handles this via setExternalFront(selectedText)
    React.useEffect(() => {
        if (!setExternalFront && selectedText) {
            setInternalFront(selectedText);
        }
    }, [selectedText, setExternalFront]);

    // Sync activeSelection with prop - but only when prop changes to a new non-empty value
    React.useEffect(() => {
        if (selectedText && selectedText.trim().length > 0) {
            setActiveSelection(selectedText);
        }
    }, [selectedText]);

    const clearSelection = () => {
        setActiveSelection('');
    };

    const handleGenerate = async (type) => { // type: 'flashcards' or 'questions'
        setGenerating(true);
        try {
            const savedProvider = localStorage.getItem('llm_provider') || 'openai';
            const savedKey = localStorage.getItem('llm_api_key') || '';
            const savedUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
            const savedModel = localStorage.getItem('llm_model') || 'gpt-3.5-turbo';

            const llm_config = {
                provider: savedProvider,
                api_key: savedKey,
                base_url: savedUrl,
                model: savedModel
            };

            const endpoint = type === 'flashcards' ? '/ai/generate-flashcards' : '/ai/generate-questions';

            // Prepare payload with context
            const payload = {
                document_id: documentId,
                count: 5,
                llm_config: llm_config,
                retrieval_mode: retrievalMode,
                requirements: requirements || discoveryProfile
            };

            // Logic to prioritize active selection or page range
            if (activeSelection && activeSelection.trim().length > 0) {
                payload.text = activeSelection;
                payload.retrieval_mode = 'manual_range'; // Selection overrides RAG/Range
            } else if (retrievalMode === 'manual_range') {
                payload.start_page = parseInt(startPage);
                payload.end_page = parseInt(endPage);
            }

            const results = await api.post(endpoint, payload);

            if (type === 'flashcards') {
                for (const card of results) {
                    await createFlashcard({
                        document_id: documentId,
                        front: card.front,
                        back: card.back,
                        tags: ['ai-generated'],
                        card_type: 'basic'
                    });
                }
                setSuccess(true);
                setTimeout(() => setSuccess(false), 2000);
            } else {
                for (const q of results) {
                    await createFlashcard({
                        document_id: documentId,
                        front: q.question + '\n\n' + q.options.join('\n'),
                        back: q.correct_answer + '\n\n' + q.explanation,
                        tags: ['ai-quiz'],
                        card_type: 'basic'
                    });
                }
                setSuccess(true);
                setTimeout(() => setSuccess(false), 2000);
            }
        } catch (err) {
            console.error('AI Generation failed:', err);
            // Handle different error types given our API interceptor returns strings sometimes
            if (typeof err === 'string') {
                alert(`AI Generation failed: ${err}`);
            } else if (err.response) {
                alert(`AI Generation failed: ${err.response.data?.detail || err.response.statusText || 'Server error'}`);
            } else if (err.request) {
                alert(`AI Generation failed: Network error - please check your connection`);
            } else {
                alert(`AI Generation failed: ${err.message || 'Unknown error'}`);
            }
        } finally {
            setGenerating(false);
        }
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        // Validation for shortcuts
        if (!front || !back) {
            // Maybe show toast warning?
            return;
        }

        setIsCreating(true);
        try {
            await createFlashcard({
                document_id: documentId,
                front,
                back,
                tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag),
                card_type: 'basic'
            });

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setFront('');
                setBack('');
                if (onComplete) onComplete();
            }, 1500);
        } catch (err) {
            console.error('Failed to create card', err);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary-400" />
                    Create Flashcard
                </h3>
                {success && (
                    <div className="flex items-center gap-1 text-emerald-400 text-sm font-bold animate-fade-in">
                        <Check className="w-4 h-4" /> SAVED
                    </div>
                )}
            </div>

            {/* Toggle Tabs */}
            <div className="flex bg-white/5 p-1 rounded-lg mb-4">
                <button
                    onClick={() => setView('manual')}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${view === 'manual' ? 'bg-primary-500 text-white shadow' : 'text-dark-400 hover:text-white'}`}
                >
                    Manual
                </button>
                {documentId && (
                    <button
                        onClick={() => setView('ai')}
                        className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${view === 'ai' ? 'bg-primary-500 text-white shadow' : 'text-dark-400 hover:text-white'}`}
                    >
                        AI Auto-Generate
                    </button>
                )}
            </div>

            {view === 'ai' ? (
                <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
                    {/* Show API Key Setup if not configured */}
                    {isLoaded && !isConfigured ? (
                        <ApiKeySetup
                            compact
                            onConfigured={() => {
                                refresh();
                                setShowingSetup(false);
                            }}
                        />
                    ) : (
                        <>
                            {/* Retrieval Mode Selection */}
                            <div className="flex bg-white/5 p-1 rounded-lg">
                                <button
                                    onClick={() => setRetrievalMode('manual_range')}
                                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${retrievalMode === 'manual_range' ? 'bg-white/10 text-white' : 'text-dark-400 hover:text-white'}`}
                                >
                                    Page Range
                                </button>
                                <button
                                    onClick={() => setRetrievalMode('rag')}
                                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${retrievalMode === 'rag' ? 'bg-primary-500 text-white shadow' : 'text-dark-400 hover:text-white'}`}
                                >
                                    AI Tutor (RAG)
                                </button>
                            </div>

                            {retrievalMode === 'rag' && !discoveryProfile ? (
                                <div className="p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl flex-1">
                                    <DiscoveryAgent
                                        documentId={documentId}
                                        onProfileGenerated={(profile) => {
                                            setDiscoveryProfile(profile);
                                            setRequirements(profile);
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <BrainCircuit className="w-6 h-6 text-primary-400" />
                                                <div>
                                                    <h4 className="font-bold text-white text-sm">
                                                        {retrievalMode === 'rag' ? 'Multimodal RAG' : 'AI Assistant'}
                                                    </h4>
                                                    <p className="text-[10px] text-primary-200/70">Using {provider}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setShowingSetup(!showingSetup)}
                                                className="p-2 hover:bg-white/10 rounded-lg text-dark-400 hover:text-white transition-colors"
                                                title="Change AI Settings"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {showingSetup && (
                                            <div className="mb-4">
                                                <ApiKeySetup
                                                    compact
                                                    onConfigured={() => {
                                                        refresh();
                                                        setShowingSetup(false);
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {/* Requirements / Generation Profile */}
                                        <div className="mb-4">
                                            <label className="block text-[10px] font-bold text-primary-300 uppercase tracking-wider mb-2">
                                                Generation Requirements
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={requirements}
                                                onChange={(e) => setRequirements(e.target.value)}
                                                className="w-full bg-dark-900/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-dark-500"
                                                placeholder="e.g. Focus on definitions, explain simply..."
                                            />
                                            {discoveryProfile && retrievalMode === 'rag' && (
                                                <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Profile built by Discovery Agent
                                                </p>
                                            )}
                                        </div>

                                        {/* Page/Section Range Controls (Only for manual_range) */}
                                        {retrievalMode === 'manual_range' && !showingSetup && (
                                            <div className={`space-y-4 ${activeSelection ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <div className="flex gap-4">
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-primary-300 uppercase tracking-wider mb-1">
                                                            {pageCount > 0 ? 'Start Page' : 'Start Section'}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={pageCount || 999}
                                                            value={startPage}
                                                            onChange={(e) => setStartPage(Math.max(1, Math.min(parseInt(e.target.value) || 1, endPage)))}
                                                            className="w-full bg-dark-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center font-bold"
                                                        />
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-primary-300 uppercase tracking-wider mb-1">
                                                            {pageCount > 0 ? 'End Page' : 'End Section'}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min={startPage}
                                                            max={pageCount || 999}
                                                            value={endPage}
                                                            onChange={(e) => setEndPage(Math.max(startPage, parseInt(e.target.value) || startPage))}
                                                            className="w-full bg-dark-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center font-bold"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Selected Text Override */}
                                        {activeSelection && (
                                            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between gap-2 mt-3">
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                    <span>Using selected text</span>
                                                </div>
                                                <button
                                                    onClick={clearSelection}
                                                    className="text-emerald-300 hover:text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleGenerate('flashcards')}
                                        disabled={generating || !isConfigured}
                                        className="btn-secondary w-full py-4 justify-center disabled:opacity-50"
                                    >
                                        {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Generate 5 Flashcards"}
                                    </button>

                                    <button
                                        onClick={() => handleGenerate('questions')}
                                        disabled={generating || !isConfigured}
                                        className="btn-secondary w-full py-4 justify-center disabled:opacity-50"
                                    >
                                        {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Generate 5 Quiz Questions"}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            ) : (
                /* Manual Form */
                <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col">
                    <div>
                        <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Front (Question)</label>
                        <textarea
                            rows={4}
                            value={front}
                            onChange={(e) => setFront(e.target.value)}
                            className="w-full resize-none"
                            placeholder="Enter the question or concept..."
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Back (Answer)</label>
                        <textarea
                            rows={4}
                            value={back}
                            onChange={(e) => setBack(e.target.value)}
                            className="w-full resize-none"
                            placeholder="Enter the answer or explanation..."
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Tags (Optional)</label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full"
                            placeholder="e.g. math, principle, exam"
                        />
                        <p className="text-[10px] text-dark-500 mt-1 uppercase">Separate tags with commas</p>
                    </div>

                    {selectedText && (
                        <div className="p-3 rounded-lg bg-primary-500/10 border border-primary-500/20 text-xs text-primary-200/70 flex gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            Creating card from selected text
                        </div>
                    )}

                    <div className="mt-auto pt-4">
                        <button
                            type="submit"
                            disabled={isCreating || !front || !back}
                            className="btn-primary w-full"
                        >
                            {isCreating ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <Plus className="w-5 h-5" />
                                    Add to Study Deck
                                </>
                            )}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
});

export default FlashcardCreator;
