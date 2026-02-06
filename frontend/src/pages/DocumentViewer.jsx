import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Maximize2,
    Minimize2,
    Settings,
    ChevronLeft,
    ChevronRight,
    Info,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Download,
    Printer,
    PanelLeftClose,
    PanelLeftOpen,
    Clock,
    TrendingUp,
    Globe,
    FileText,
    Network,
    Loader2,
    Layout,
    PanelRightClose,
    PanelRightOpen,
    Sparkles,
    Zap,
    BookOpen,
    Menu,
    Plus,
    Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useDocumentStore from '../stores/useDocumentStore';
import useFlashcardStore from '../stores/useFlashcardStore';
import ConceptService from '../services/concepts';
import api from '../services/api';
import useTimerStore from '../stores/useTimerStore';
import { useTimer } from '../hooks/useTimer';
import FlashcardCreator from '../components/flashcards/FlashcardCreator';
import ImageGallery from '../components/documents/ImageGallery';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';

// Register PDF worker - Using Vite-compatible URL resolution
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

// Required CSS for react-pdf text layer
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

/**
 * Helper to extract filename from a full system path.
 */
const getFileName = (path) => {
    if (!path) return '';
    return path.split(/[/\\]/).pop();
};

const LazyPage = ({ pageNumber, scale, handleTextSelection }) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = React.useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            {
                root: document.getElementById('document-scroll-container'),
                rootMargin: '100% 0px', // Preload 1 screen height
                threshold: 0
            }
        );

        if (elementRef.current) {
            observer.observe(elementRef.current);
        }

        return () => {
            if (elementRef.current) {
                observer.unobserve(elementRef.current);
            }
        };
    }, []);

    return (
        <div
            ref={elementRef}
            className="shadow-2xl mb-8 relative group bg-white rounded-lg overflow-hidden transition-all"
            style={{
                minHeight: isVisible ? 'auto' : `${800 * scale}px`,
                width: '100%', // Allow page to determine width, but placeholder needs constraints
                maxWidth: 'fit-content'
            }}
            onMouseUp={handleTextSelection}
        >
            {isVisible ? (
                <>
                    <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        loading={<div className="h-[800px] w-full bg-white/5 animate-pulse" />}
                    />
                    <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest">
                        Page {pageNumber}
                    </div>
                </>
            ) : (
                <div
                    className="bg-white/5 animate-pulse flex items-center justify-center text-dark-500 text-xs font-bold uppercase tracking-widest"
                    style={{
                        height: `${800 * scale}px`,
                        width: `${600 * scale}px` // Rough A4 aspect ratio estimate 
                    }}
                >
                    Loading Page {pageNumber}...
                </div>
            )}
        </div>
    );
};

const DocumentViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [studyDoc, setStudyDoc] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedText, setSelectedText] = useState('');
    const [showCreator, setShowCreator] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [progress, setProgress] = useState(0);
    const [numPages, setNumPages] = useState(null);
    const [lastSavedTime, setLastSavedTime] = useState(0);

    // Sidebar & Flashcard State
    const [sidebarWidth, setSidebarWidth] = useState(384);
    const [isResizing, setIsResizing] = useState(false);
    const scrollTimeoutRef = React.useRef(null);
    const [flashcardFront, setFlashcardFront] = useState('');
    const [flashcardBack, setFlashcardBack] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

    const flashcardCreatorRef = React.useRef(null);
    const { seconds, formatTime: formatPassiveTime } = useTimer(true);
    const {
        timeLeft, isActive: isTimerActive, mode: timerMode,
        togglePlayPause, activeSessionId: timerSessionId
    } = useTimerStore();

    const formatFocusTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        const startSession = async () => {
            try {
                await api.post(`/documents/${id}/start-session`);
            } catch (err) {
                console.error('Failed to start session', err);
            }
        };
        startSession();
    }, [id]);

    useEffect(() => {
        const syncOnClose = () => {
            const payload = JSON.stringify({
                seconds_spent: 0,
                reading_progress: progress / 100
            });
            navigator.sendBeacon(`http://localhost:8000/api/documents/${id}/end-session`, payload);
        };
        window.addEventListener('beforeunload', syncOnClose);
        return () => {
            window.removeEventListener('beforeunload', syncOnClose);
            const endSession = async () => {
                try {
                    await api.post(`/documents/${id}/end-session`, {
                        seconds_spent: 0,
                        reading_progress: progress / 100
                    });
                } catch (err) {
                    console.error('Failed to end session', err);
                }
            };
            endSession();
        };
    }, [id, progress]);

    useEffect(() => {
        if (seconds > 0 && seconds % 30 === 0 && seconds !== lastSavedTime) {
            const syncTime = async () => {
                try {
                    await api.post(`/documents/${id}/end-session`, {
                        seconds_spent: 30,
                        reading_progress: progress / 100
                    });
                    setLastSavedTime(seconds);
                } catch (err) {
                    console.error('Failed to sync time', err);
                }
            };
            syncTime();
        }
    }, [seconds, id, progress, lastSavedTime]);

    useEffect(() => {
        const fetchDoc = async () => {
            try {
                const data = await api.get(`/documents/${id}`);
                setStudyDoc(data);
                const savedProgress = data.reading_progress || 0;
                setProgress(Math.round(savedProgress * 100));

                setTimeout(() => {
                    const container = window.document.getElementById('document-scroll-container');
                    if (container) {
                        const scrollTo = container.scrollHeight * savedProgress;
                        container.scrollTop = scrollTo;
                    }
                }, 1000);
            } catch (err) {
                console.error('Failed to fetch document', err);
                setError(err.message || 'Failed to load document');
            } finally {
                setIsLoading(false);
            }
        };
        fetchDoc();
    }, [id, navigate]);

    // Auto-trigger extraction if text is missing but file is available
    useEffect(() => {
        if (!isLoading && studyDoc && !studyDoc.extracted_text && studyDoc.file_path && !isExtracting) {
            console.log("Empty document text detected, triggering auto-synthesis...");
            handleExtractConcepts();
        }
    }, [isLoading, studyDoc]);

    const handleScroll = useCallback((e) => {
        const container = e.target;

        if (scrollTimeoutRef.current) return;

        scrollTimeoutRef.current = setTimeout(() => {
            const scrollPercentage = container.scrollTop / (container.scrollHeight - container.clientHeight);
            const newProgress = Math.round(scrollPercentage * 100);

            setProgress(prev => {
                if (Math.abs(newProgress - prev) > 1) {
                    return newProgress;
                }
                return prev;
            });
            scrollTimeoutRef.current = null;
        }, 300); // Update every 300ms
    }, []);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
    };

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection().toString().trim();
        if (selection) {
            setSelectedText(selection);
        }
    }, []);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
    const handleResetZoom = () => setZoom(1);

    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2000);
    };

    const toggleFocusMode = () => {
        if (!isFocusMode) {
            if (window.document.documentElement.requestFullscreen) {
                window.document.documentElement.requestFullscreen();
            }
            setIsFocusMode(true);
        } else {
            if (window.document.exitFullscreen && window.document.fullscreenElement) {
                window.document.exitFullscreen();
            }
            setIsFocusMode(false);
        }
    };

    const handleExtractConcepts = async () => {
        setIsExtracting(true);
        try {
            const response = await ConceptService.extractConcepts(id);
            if (response.status === 'success') {
                showToast('Knowledge graph updated!', 'success');
            } else {
                showToast(response.message || 'Synthesis complete with warnings', 'info');
            }
        } catch (err) {
            console.error(err);
            const errorMessage = err.response?.data?.detail || err.message || 'Extraction failed';
            showToast(errorMessage, 'error');
        } finally {
            setIsExtracting(false);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            const currentlyFullscreen = !!window.document.fullscreenElement;
            if (!currentlyFullscreen && isFocusMode) {
                setIsFocusMode(false);
            }
        };
        window.document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => window.document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [isFocusMode]);

    const startResizing = useCallback(() => setIsResizing(true), []);
    const stopResizing = useCallback(() => setIsResizing(false), []);
    const resize = useCallback((mouseMoveEvent) => {
        if (isResizing) {
            const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
            if (newWidth > 300 && newWidth < 800) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'q') {
                if (selectedText) {
                    setFlashcardFront(selectedText);
                    showToast('Text copied to Question', 'success');
                    if (!showCreator) setShowCreator(true);
                } else {
                    showToast('Select text first', 'error');
                }
            } else if (e.key.toLowerCase() === 'a') {
                if (selectedText) {
                    setFlashcardBack(selectedText);
                    showToast('Text copied to Answer', 'success');
                    if (!showCreator) setShowCreator(true);
                } else {
                    showToast('Select text first', 'error');
                }
            } else if (e.key.toLowerCase() === 's') {
                if (flashcardCreatorRef.current) {
                    e.preventDefault();
                    flashcardCreatorRef.current.saveCard();
                    showToast('Saving flashcard...', 'info');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedText, showCreator]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    if (error || !studyDoc) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                <div className="p-4 rounded-full bg-red-500/10 text-red-500">
                    <Info className="w-12 h-12" />
                </div>
                <h2 className="text-xl font-bold text-white">Something went wrong</h2>
                <p className="text-dark-400 max-w-md">{error || 'Document not found'}</p>
                <button onClick={() => navigate('/documents')} className="btn-secondary">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Library
                </button>
            </div>
        );
    }

    const fileName = getFileName(studyDoc.file_path);
    const isLink = studyDoc?.file_type === 'link';
    const fileUrl = isLink ? studyDoc.file_path : (fileName ? `http://localhost:8000/uploads/${fileName}` : '');

    return (
        <div className={`flex flex-col bg-dark-950 transition-all duration-300 ${isFocusMode ? 'fixed inset-0 z-[60] p-0 h-screen' : 'h-[calc(100vh-4rem)]'}`}>
            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-20 right-8 z-[200] animate-slide-in">
                    <div className={`px-4 py-2 rounded-lg shadow-2xl backdrop-blur-md border border-white/10 flex items-center gap-2 font-bold text-sm ${toast.type === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-primary-500/20 text-primary-100'}`}>
                        {toast.type === 'success' && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                        {toast.type === 'error' && <div className="w-2 h-2 rounded-full bg-red-400" />}
                        {toast.type === 'info' && <div className="w-2 h-2 rounded-full bg-blue-400" />}
                        {toast.message}
                    </div>
                </div>
            )}

            {/* Top Fixed Progress Bar */}
            <div className="fixed top-0 left-0 right-0 h-1 z-[110] bg-dark-950/20">
                <motion.div
                    className="h-full bg-gradient-to-r from-primary-600 via-primary-500 to-primary-400 shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>

            {/* Streamlined Header */}
            {!isFocusMode && (
                <div className="flex items-center justify-between gap-4 px-6 py-3 bg-dark-900/60 backdrop-blur-xl border-b border-white/5 shrink-0 z-50">
                    <div className="flex items-center gap-4 min-w-0">
                        <Link to="/documents" className="p-2.5 hover:bg-white/5 rounded-xl transition-all text-dark-300 active:scale-95 border border-transparent hover:border-white/5">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="text-sm font-black uppercase tracking-tight truncate max-w-[200px] md:max-w-md text-white/90 leading-tight">
                                {studyDoc?.title}
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-primary-400 font-black uppercase tracking-[0.2em]">
                                    {studyDoc?.category || 'General Study'}
                                </span>
                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                <span className="text-[9px] text-dark-500 font-bold uppercase tracking-widest">
                                    {progress}% READ
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Zoom Controls (Compact) */}
                        <div className="hidden lg:flex items-center gap-0.5 bg-white/5 p-1 rounded-xl border border-white/5">
                            <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/10 rounded-lg text-dark-400 transition-colors">
                                <ZoomOut className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-black w-10 text-center text-dark-200">{Math.round(zoom * 100)}%</span>
                            <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/10 rounded-lg text-dark-400 transition-colors">
                                <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Stats Dashboard (Compact) */}
                        <div className="hidden xl:flex items-center gap-6 px-4 py-1.5 bg-white/5 rounded-xl border border-white/5 mx-2">
                            <div className="flex flex-col">
                                <span className="text-[8px] text-dark-500 font-black uppercase tracking-widest leading-none">Est. Left</span>
                                <span className="text-[11px] font-black text-dark-200 mt-1">
                                    {studyDoc.completion_estimate ?
                                        (studyDoc.completion_estimate > 3600 ?
                                            `${Math.round(studyDoc.completion_estimate / 3600)}h ${Math.round((studyDoc.completion_estimate % 3600) / 60)}m` :
                                            `${Math.round(studyDoc.completion_estimate / 60)}m`)
                                        : '--'}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[8px] text-dark-500 font-black uppercase tracking-widest leading-none">Focus Session</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <button
                                        onClick={togglePlayPause}
                                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isTimerActive ? 'bg-amber-500/10 text-amber-500' : 'bg-primary-500/10 text-primary-500'}`}
                                    >
                                        {isTimerActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                                    </button>
                                    <span className={`text-[11px] font-black ${isTimerActive ? 'text-primary-400' : 'text-dark-400'} font-mono tracking-tight`}>
                                        {formatFocusTime(timeLeft)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleExtractConcepts}
                                disabled={isExtracting}
                                className={`p-2.5 rounded-xl transition-all border border-transparent ${isExtracting ? 'text-primary-400 animate-pulse' : 'text-dark-400 hover:bg-white/5 hover:border-white/10'}`}
                                title="Map Concepts (AI)"
                            >
                                {isExtracting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Network className="w-4.5 h-4.5" />}
                            </button>
                            <button onClick={toggleFocusMode} className="p-2.5 rounded-xl text-dark-400 hover:bg-white/5 hover:border-white/10 border border-transparent transition-all" title="Focus Mode">
                                <Maximize2 className="w-4.5 h-4.5" />
                            </button>
                            <button
                                onClick={() => setShowCreator(!showCreator)}
                                className={`p-2.5 rounded-xl transition-all border ${showCreator ? 'bg-primary-500/20 text-primary-400 border-primary-500/30' : 'text-dark-400 hover:bg-white/5 border-transparent'}`}
                                title="Flashcard Creator"
                            >
                                {showCreator ? <PanelRightClose className="w-4.5 h-4.5" /> : <PanelRightOpen className="w-4.5 h-4.5" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content + Sidebar Wrapper */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Main Content Column */}
                <div className="flex-1 flex flex-col min-w-0 bg-dark-900/50 relative">
                    <div id="document-scroll-container" className="flex-1 overflow-auto custom-scrollbar" onScroll={handleScroll}>
                        <div className={`min-w-full min-h-full flex flex-col ${['pdf', 'image'].includes(studyDoc?.file_type) ? 'items-center py-12' : ''}`}>

                            {studyDoc?.file_type === 'pdf' ? (
                                <div className="w-full flex flex-col items-center py-8">
                                    <Document
                                        file={`http://localhost:8000/uploads/${fileName}`}
                                        onLoadSuccess={onDocumentLoadSuccess}
                                        className="flex flex-col items-center gap-4"
                                        loading={
                                            <div className="flex flex-col items-center gap-4 py-20">
                                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
                                                <p className="text-dark-400 font-bold uppercase tracking-widest text-xs">Loading PDF...</p>
                                            </div>
                                        }
                                    >
                                        {Array.from(new Array(numPages), (el, index) => (
                                            <LazyPage
                                                key={`page_${index + 1}`}
                                                pageNumber={index + 1}
                                                scale={zoom}
                                                handleTextSelection={handleTextSelection}
                                            />
                                        ))}
                                    </Document>
                                </div>
                            ) : studyDoc?.file_type === 'link' ? (
                                <div className="flex-1 w-full bg-white relative">
                                    <iframe src={fileUrl} className="absolute inset-0 w-full h-full border-none" title={studyDoc.title} />
                                </div>
                            ) : (studyDoc.file_type === 'markdown' || studyDoc.file_type === 'text') ? (
                                <div className="w-full flex-1 flex flex-col items-center py-12 px-6">
                                    <div className="w-full max-w-4xl bg-dark-900/40 backdrop-blur-md rounded-[2.5rem] border border-white/10 shadow-2xl p-8 md:p-16 relative" onMouseUp={handleTextSelection}>
                                        <div className="flex items-center gap-3 mb-10 pb-6 border-b border-white/5">
                                            <div className="p-3 rounded-2xl bg-primary-500/10 border border-primary-500/20">
                                                <FileText className="w-6 h-6 text-primary-400" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mb-1">Reading Mode</p>
                                                <h2 className="text-2xl font-black text-white">{studyDoc.title}</h2>
                                            </div>
                                        </div>
                                        <div className="markdown-content">
                                            {studyDoc.file_type === 'markdown' ? (
                                                <ReactMarkdown>{studyDoc.extracted_text}</ReactMarkdown>
                                            ) : (
                                                <pre className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-dark-100 italic">
                                                    {studyDoc.extracted_text}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                    <div className="h-20 shrink-0" />
                                </div>
                            ) : studyDoc.file_type === 'image' ? (
                                <div className="p-8">
                                    <img src={fileUrl} alt={studyDoc.title} className="max-w-full shadow-2xl rounded-lg ring-1 ring-white/10" onMouseUp={handleTextSelection} />
                                </div>
                            ) : (
                                <pre className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-dark-100 p-8">{studyDoc.extracted_text}</pre>
                            )}
                        </div>
                    </div>
                </div>

                {/* Floating Sidebar Container */}
                <AnimatePresence>
                    {showCreator && !isFocusMode && (
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="absolute top-0 right-0 bottom-0 z-40 bg-dark-900/80 backdrop-blur-3xl border-l border-white/10 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
                            style={{ width: sidebarWidth }}
                        >
                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-6 space-y-6">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center border border-primary-500/30">
                                            <Sparkles className="w-4 h-4 text-primary-400" />
                                        </div>
                                        <h3 className="text-sm font-black uppercase tracking-widest text-white/80">Creator</h3>
                                    </div>
                                    <button
                                        onClick={() => setShowCreator(false)}
                                        className="p-2 hover:bg-white/5 rounded-xl text-dark-500 transition-colors"
                                    >
                                        <PanelRightClose className="w-5 h-5" />
                                    </button>
                                </div>

                                <FlashcardCreator
                                    ref={flashcardCreatorRef}
                                    studyDoc={studyDoc}
                                    selectedText={selectedText}
                                    onComplete={() => {
                                        setSelectedText('');
                                        setFlashcardFront('');
                                        setFlashcardBack('');
                                    }}
                                    externalFront={flashcardFront}
                                    externalBack={flashcardBack}
                                    setExternalFront={setFlashcardFront}
                                    setExternalBack={setFlashcardBack}
                                />

                                {/* Visual Assets Gallery */}
                                <ImageGallery documentId={id} />

                                {studyDoc?.extracted_text && (
                                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5 group hover:border-white/10 transition-colors">
                                        <h4 className="text-[10px] font-black text-dark-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <FileText className="w-3.5 h-3.5" />
                                            Live Source
                                        </h4>
                                        <div className="text-xs text-dark-300 leading-relaxed font-serif italic max-h-[300px] overflow-y-auto custom-scrollbar pr-2" onMouseUp={handleTextSelection}>
                                            {studyDoc.extracted_text}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Resize Handle */}
                            <div
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary-500/50 transition-colors group"
                                onMouseDown={startResizing}
                            >
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-10 bg-white/10 rounded-full group-hover:bg-white/30 transition-colors" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default DocumentViewer;
