import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Maximize2,
    Settings,
    ZoomIn,
    ZoomOut,
    Download,
    PanelRightClose,
    PanelRightOpen,
    Play,
    Pause,
    FileText,
    Network,
    Loader2,
    Sparkles,
    MessageSquare,
    StickyNote,
    Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useDocumentStore from '../stores/useDocumentStore';
import useFlashcardStore from '../stores/useFlashcardStore';
import ConceptService from '../services/concepts';
import api from '../services/api';
import { getApiUrl } from '../lib/config';
import useTimerStore from '../stores/useTimerStore';
import { useTimer } from '../hooks/useTimer';
import FlashcardCreator from '../components/flashcards/FlashcardCreator';
import RecallStudio from '../components/documents/RecallStudio';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels';

// Open Notebook Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/open-notebook/ui/tabs';
import { ChatColumn } from '@/modules/open-notebook/components/ChatColumn';
import NotesColumnContainer from '@/modules/open-notebook/components/NotesColumnContainer';

// Register PDF worker - use local bundled worker for reliability
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
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

const LazyPage = ({ pageNumber, pageWidth, handleTextSelection }) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = React.useRef(null);
    const placeholderHeight = Math.max(400, Math.round(pageWidth * 1.414));

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
            className="shadow-2xl mb-8 relative group bg-white rounded-2xl overflow-hidden transition-all border border-black/5"
            style={{
                minHeight: isVisible ? 'auto' : `${placeholderHeight}px`,
                width: '100%'
            }}
            onMouseUp={handleTextSelection}
        >
            {isVisible ? (
                <>
                    <Page
                        pageNumber={pageNumber}
                        width={pageWidth}
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
                        height: `${placeholderHeight}px`,
                        width: `${Math.max(320, Math.round(pageWidth * 0.74))}px`
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
    const [searchParams] = useSearchParams();
    const [studyDoc, setStudyDoc] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedText, setSelectedText] = useState('');
    const [zoom, setZoom] = useState(1);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [progress, setProgress] = useState(0);
    const [numPages, setNumPages] = useState(null);
    const [lastSavedTime, setLastSavedTime] = useState(0);
    const [apiBaseUrl, setApiBaseUrl] = useState('');
    const [pdfError, setPdfError] = useState(null);

    // Open Notebook State
    const [contextSelections, setContextSelections] = useState({ sources: {}, notes: {} });
    const initialTab = searchParams.get('tab') || "chat";
    const initialSessionId = searchParams.get('sessionId') || null;
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
    const [sections, setSections] = useState([]);
    const [quality, setQuality] = useState(null);
    const [ingestionJob, setIngestionJob] = useState(null);
    const [isSectionBusy, setIsSectionBusy] = useState(false);

    // Flashcard State
    const [flashcardFront, setFlashcardFront] = useState('');
    const [flashcardBack, setFlashcardBack] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const flashcardCreatorRef = React.useRef(null);
    const rightPanelRef = usePanelRef();
    const leftPanelContainerRef = useRef(null);
    const [panelWidth, setPanelWidth] = useState(0);

    const { seconds } = useTimer(true);
    const {
        timeLeft, isActive: isTimerActive,
        togglePlayPause
    } = useTimerStore();

    const formatFocusTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        let isMounted = true;
        getApiUrl()
            .then((url) => {
                if (isMounted) setApiBaseUrl(url || '');
            })
            .catch(() => {
                if (isMounted) setApiBaseUrl('');
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const apiOrigin = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
    const apiPrefix = apiOrigin ? `${apiOrigin}/api` : '/api';
    const uploadsPrefix = apiOrigin ? `${apiOrigin}/uploads` : '/uploads';
    const fileName = useMemo(() => getFileName(studyDoc?.file_path), [studyDoc?.file_path]);
    const encodedFileName = useMemo(() => (fileName ? encodeURIComponent(fileName) : ''), [fileName]);
    const pdfFile = useMemo(
        () => (encodedFileName ? `${uploadsPrefix}/${encodedFileName}` : null),
        [uploadsPrefix, encodedFileName]
    );
    const pdfOptions = useMemo(() => ({
        cMapUrl: new URL('pdfjs-dist/cmaps/', import.meta.url).toString(),
        cMapPacked: true,
        standardFontDataUrl: new URL('pdfjs-dist/standard_fonts/', import.meta.url).toString(),
        wasmUrl: new URL('pdfjs-dist/build/', import.meta.url).toString()
    }), []);

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
            navigator.sendBeacon(`${apiPrefix}/documents/${id}/end-session`, new Blob([payload], { type: 'application/json' }));
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
    }, [id, progress, apiPrefix]);

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

    useEffect(() => {
        const fetchCore = async () => {
            try {
                const [sectionsRes, qualityRes] = await Promise.all([
                    api.get(`/documents/${id}/sections`, { params: { include_all: true } }),
                    api.get(`/documents/${id}/quality`)
                ]);
                setSections(sectionsRes || []);
                setQuality(qualityRes || null);
            } catch (err) {
                console.error('Failed to load document core data', err);
            }
            try {
                const jobRes = await api.get(`/documents/${id}/ingestion`);
                setIngestionJob(jobRes);
            } catch {
                setIngestionJob(null);
            }
        };
        fetchCore();
    }, [id]);

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);


    const handleScroll = useCallback((e) => {
        const container = e.target;
        // Simple throttle
        const scrollPercentage = container.scrollTop / (container.scrollHeight - container.clientHeight);
        const newProgress = Math.round(scrollPercentage * 100);
        if (Math.abs(newProgress - progress) > 1) {
            setProgress(newProgress);
        }
    }, [progress]);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        setPdfError(null);
    };

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection().toString().trim();
        if (selection) {
            setSelectedText(selection);
        }
    }, []);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));

    // Toast logic
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

    const toggleRightPanel = () => {
        const panel = rightPanelRef.current;
        if (!panel) return;
        if (panel.isCollapsed()) {
            panel.expand();
        } else {
            panel.collapse();
        }
    };

    const handleToggleSection = async (section) => {
        if (!section) return;
        setIsSectionBusy(true);
        try {
            const updated = await api.patch(`/documents/${id}/sections/${section.id}`, {
                included: !section.included
            });
            setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            const qualityRes = await api.get(`/documents/${id}/quality`);
            setQuality(qualityRes || null);
        } catch (err) {
            console.error('Failed to update section', err);
        } finally {
            setIsSectionBusy(false);
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

    useEffect(() => {
        const node = leftPanelContainerRef.current;
        if (!node) return;
        const updateSize = () => {
            const width = node.clientWidth || 0;
            setPanelWidth(width);
        };
        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    // Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'q') {
                if (selectedText) {
                    setFlashcardFront(selectedText);
                    showToast('Text copied to Question', 'success');
                    // Switch to Flashcards tab
                    setActiveTab("flashcards");
                    if (isRightPanelCollapsed) setIsRightPanelCollapsed(false); // Open if closed
                } else {
                    showToast('Select text first', 'error');
                }
            } else if (e.key.toLowerCase() === 'a') {
                if (selectedText) {
                    setFlashcardBack(selectedText);
                    showToast('Text copied to Answer', 'success');
                    setActiveTab("flashcards");
                    if (isRightPanelCollapsed) setIsRightPanelCollapsed(false);
                } else {
                    showToast('Select text first', 'error');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedText, isRightPanelCollapsed]);

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
                    <Maximize2 className="w-12 h-12" />
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

    const isLink = studyDoc?.file_type === 'link';
    const fileUrl = isLink ? studyDoc.file_path : (encodedFileName ? `${uploadsPrefix}/${encodedFileName}` : '');

    return (
        <div className={`flex flex-col bg-dark-950 transition-all duration-300 ${isFocusMode ? 'fixed inset-0 z-[60] p-0 h-screen' : 'h-[calc(100vh-4rem)]'}`}>
            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-20 right-8 z-[200] animate-slide-in">
                    <div className={`px-4 py-2 rounded-lg shadow-2xl backdrop-blur-md border border-white/10 flex items-center gap-2 font-bold text-sm ${toast.type === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-primary-500/20 text-primary-100'}`}>
                        {toast.message}
                    </div>
                </div>
            )}

            {/* Top Fixed Progress Bar - Removed per user request */}

            {/* Header */}
            {!isFocusMode && (
                <div className="flex items-center justify-between gap-4 px-6 py-3.5 bg-dark-900/70 backdrop-blur-xl border-b border-white/5 shrink-0 z-50">
                    <div className="flex items-center gap-4 min-w-0">
                        <Link to="/documents" className="p-2.5 hover:bg-white/5 rounded-xl transition-all text-dark-300 active:scale-95 border border-transparent hover:border-white/5">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="text-base md:text-lg font-semibold tracking-tight truncate max-w-[200px] md:max-w-md text-white leading-tight">
                                {studyDoc?.title}
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-primary-300 font-bold uppercase tracking-[0.18em]">
                                    {studyDoc?.category || 'General Study'}
                                </span>
                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                <span className="text-[10px] text-dark-500 font-semibold uppercase tracking-widest">
                                    {progress}% READ
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden lg:flex items-center gap-0.5 bg-white/5 p-1 rounded-xl border border-white/5">
                            <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/10 rounded-lg text-dark-400 transition-colors">
                                <ZoomOut className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-black w-10 text-center text-dark-200">{Math.round(zoom * 100)}%</span>
                            <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/10 rounded-lg text-dark-400 transition-colors">
                                <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <div className="hidden xl:flex items-center gap-6 px-4 py-1.5 bg-white/5 rounded-xl border border-white/5 mx-2">
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

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleExtractConcepts}
                                disabled={isExtracting}
                                className={`p-2.5 rounded-xl transition-all border border-transparent ${isExtracting ? 'text-primary-400 animate-pulse' : 'text-dark-400 hover:bg-white/5 hover:border-white/10'}`}
                                title="Map Concepts (AI)"
                            >
                                {isExtracting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Network className="w-4.5 h-4.5" />}
                            </button>
                            <button
                                onClick={() => navigate(`/knowledge-graph?docId=${id}`)}
                                className="p-2.5 rounded-xl text-dark-400 hover:bg-white/5 hover:border-white/10 border border-transparent transition-all"
                                title="Open in Knowledge Graph"
                            >
                                <Layers className="w-4.5 h-4.5" />
                            </button>
                            <button
                                onClick={toggleRightPanel}
                                className="p-2.5 rounded-xl text-dark-400 hover:bg-white/5 hover:border-white/10 border border-transparent transition-all"
                                title={isRightPanelCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                            >
                                {isRightPanelCollapsed ? <PanelRightOpen className="w-4.5 h-4.5" /> : <PanelRightClose className="w-4.5 h-4.5" />}
                            </button>
                            <button onClick={toggleFocusMode} className="p-2.5 rounded-xl text-dark-400 hover:bg-white/5 hover:border-white/10 border border-transparent transition-all" title="Focus Mode">
                                <Maximize2 className="w-4.5 h-4.5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Split View Container */}
            <div className="flex-1 flex overflow-hidden relative">
                <Group direction="horizontal">
                    {/* Left Panel: Document */}
                    <Panel defaultSize={60} minSize={30} className="flex flex-col bg-dark-900/50">
                        <div
                            id="document-scroll-container"
                            ref={leftPanelContainerRef}
                            className="flex-1 overflow-auto custom-scrollbar"
                            onScroll={handleScroll}
                        >
                            <div className={`min-w-full min-h-full flex flex-col ${['pdf', 'image'].includes(studyDoc?.file_type) ? 'items-center py-10' : ''}`}>
                                {(studyDoc?.file_type === 'pdf' || studyDoc?.filename?.toLowerCase().endsWith('.pdf') || studyDoc?.file_path?.toLowerCase().endsWith('.pdf')) ? (
                                    <div className="w-full flex flex-col items-center py-8 px-4">
                                        {pdfFile ? (
                                            <Document
                                                file={pdfFile}
                                                onLoadSuccess={onDocumentLoadSuccess}
                                                className="flex flex-col items-center gap-4"
                                                loading={<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 my-20"></div>}
                                                onLoadError={(err) => {
                                                    console.error('PDF load error', err);
                                                    setPdfError(err?.message || 'Failed to load PDF');
                                                }}
                                                onSourceError={(err) => {
                                                    console.error('PDF source error', err);
                                                    setPdfError(err?.message || 'Failed to load PDF source');
                                                }}
                                                options={pdfOptions}
                                            >
                                                {pdfError && (
                                                    <div className="w-full max-w-2xl bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-xl text-sm">
                                                        {pdfError}
                                                    </div>
                                                )}
                                                {numPages && !pdfError && Array.from({ length: numPages }, (el, index) => (
                                                    <LazyPage
                                                        key={`page_${index + 1}`}
                                                        pageNumber={index + 1}
                                                        pageWidth={Math.max(320, Math.floor((panelWidth || 900) * 0.92 * zoom))}
                                                        handleTextSelection={handleTextSelection}
                                                    />
                                                ))}
                                                {!numPages && !pdfError && (
                                                    <div className="text-dark-400 text-sm py-10">Preparing pages...</div>
                                                )}
                                            </Document>
                                        ) : (
                                            <div className="text-dark-400 text-sm py-10">
                                                PDF file not available.
                                            </div>
                                        )}
                                    </div>
                                ) : studyDoc?.file_type === 'link' ? (
                                    <div className="flex-1 w-full bg-white relative">
                                        <iframe src={fileUrl} className="absolute inset-0 w-full h-full border-none" title={studyDoc.title} />
                                    </div>
                                ) : (studyDoc.file_type === 'markdown' || studyDoc.file_type === 'text') ? (
                                    <div className="w-full flex-1 flex flex-col items-center py-10 px-6">
                                        <div
                                            className="w-full max-w-5xl bg-dark-900/50 backdrop-blur-md rounded-[2.5rem] border border-white/10 shadow-2xl p-8 md:p-14 relative"
                                            onMouseUp={handleTextSelection}
                                        >
                                            <div className="markdown-content">
                                                {studyDoc.file_type === 'markdown' ? (
                                                    <ReactMarkdown>{studyDoc.extracted_text}</ReactMarkdown>
                                                ) : <pre className="whitespace-pre-wrap font-sans text-lg">{studyDoc.extracted_text}</pre>}
                                            </div>
                                        </div>
                                    </div>
                                ) : (studyDoc.file_type === 'image' || studyDoc?.filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) ? (
                                    <div className="p-8">
                                        <img src={fileUrl} alt={studyDoc.title} className="max-w-full shadow-2xl rounded-lg ring-1 ring-white/10" onMouseUp={handleTextSelection} />
                                    </div>
                                ) : (
                                    <pre className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-dark-100 p-8">{studyDoc.extracted_text || "No content"}</pre>
                                )}
                            </div>
                        </div>
                    </Panel>

                    <Separator className="w-1.5 bg-dark-950 hover:bg-primary-500 transition-colors flex items-center justify-center group z-50">
                        <div className="w-0.5 h-8 bg-white/20 group-hover:bg-white rounded-full transition-colors" />
                    </Separator>

                    {/* Right Panel: Open Notebook (Chat/Notes/Flashcards) */}
                    <Panel
                        panelRef={rightPanelRef}
                        defaultSize={40}
                        minSize={20}
                        collapsible={true}
                        onResize={() => {
                            const panel = rightPanelRef.current;
                            if (!panel) return;
                            setIsRightPanelCollapsed(panel.isCollapsed());
                        }}
                        className="bg-dark-900 border-l border-white/5"
                    >
                        <div className="h-full flex flex-col">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                                <div className="px-4 py-3 border-b border-white/5 bg-dark-900/80 backdrop-blur-sm">
                                    <TabsList className="grid w-full grid-cols-5 bg-dark-800/60 border border-white/10 rounded-xl">
                                        <TabsTrigger value="chat" className="text-[10px] uppercase tracking-wider font-black"><MessageSquare className="w-3.5 h-3.5 mr-2" />Chat</TabsTrigger>
                                        <TabsTrigger value="notes" className="text-[10px] uppercase tracking-wider font-black"><StickyNote className="w-3.5 h-3.5 mr-2" />Notes</TabsTrigger>
                                        <TabsTrigger value="flashcards" className="text-[10px] uppercase tracking-wider font-black"><Sparkles className="w-3.5 h-3.5 mr-2" />Cards</TabsTrigger>
                                        <TabsTrigger value="core" className="text-[10px] uppercase tracking-wider font-black"><FileText className="w-3.5 h-3.5 mr-2" />Core</TabsTrigger>
                                        <TabsTrigger value="recall" className="text-[10px] uppercase tracking-wider font-black"><Layers className="w-3.5 h-3.5 mr-2" />Recall</TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="chat" className="flex-1 overflow-hidden m-0 p-0">
                                    <ChatColumn notebookId={id} contextSelections={contextSelections} />
                                </TabsContent>

                                <TabsContent value="notes" className="flex-1 overflow-hidden m-0 p-0">
                                    <NotesColumnContainer notebookId={id} contextSelections={contextSelections} />
                                </TabsContent>

                                <TabsContent value="flashcards" className="flex-1 overflow-hidden m-0 p-4">
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
                                </TabsContent>

                                <TabsContent value="core" className="flex-1 overflow-y-auto m-0 p-4 space-y-4">
                                    <div className="p-4 rounded-2xl bg-dark-900/60 border border-white/10">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-widest text-dark-500 font-bold">Content Quality</p>
                                                <h4 className="text-white font-bold text-sm mt-1">Filtered Core View</h4>
                                            </div>
                                            {ingestionJob && (
                                                <div className="text-[10px] text-dark-400 uppercase tracking-widest">
                                                    {ingestionJob.phase}: {Math.round(ingestionJob.progress || 0)}%
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                                <p className="text-dark-500 uppercase font-bold text-[10px]">Raw Words</p>
                                                <p className="text-white font-black text-lg">{quality?.raw_word_count || 0}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                                <p className="text-dark-500 uppercase font-bold text-[10px]">Filtered Words</p>
                                                <p className="text-white font-black text-lg">{quality?.filtered_word_count || 0}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                                <p className="text-dark-500 uppercase font-bold text-[10px]">Boilerplate Removed</p>
                                                <p className="text-white font-black text-lg">{quality?.boilerplate_removed_lines || 0}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                                <p className="text-dark-500 uppercase font-bold text-[10px]">Dedup Ratio</p>
                                                <p className="text-white font-black text-lg">{quality?.dedup_ratio ?? 0}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-4 text-[10px] uppercase tracking-widest text-dark-500">
                                            <span>OCR: {quality?.ocr_status || 'n/a'}</span>
                                            {quality?.ocr_provider && <span>Provider: {quality.ocr_provider}</span>}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-dark-400">Sections</h4>
                                            <span className="text-[10px] text-dark-500 uppercase tracking-widest">
                                                {quality?.sections_included || 0}/{quality?.sections_total || 0} included
                                            </span>
                                        </div>

                                        {sections.length === 0 && (
                                            <div className="p-4 rounded-2xl border border-white/5 text-xs text-dark-500">
                                                No sections extracted yet. Try again after processing completes.
                                            </div>
                                        )}

                                        {sections.map((section) => (
                                            <div key={section.id} className="p-4 rounded-2xl bg-dark-900/40 border border-white/5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-bold text-white">
                                                            {section.title || `Section ${section.section_index + 1}`}
                                                        </p>
                                                        <p className="text-[11px] text-dark-500 mt-1">
                                                            {section.excerpt || section.content?.slice(0, 160)}
                                                        </p>
                                                    </div>
                                                    <button
                                                        disabled={isSectionBusy}
                                                        onClick={() => handleToggleSection(section)}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${section.included ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-dark-400 border-white/10'}`}
                                                    >
                                                        {section.included ? 'Included' : 'Excluded'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>

                                <TabsContent value="recall" className="flex-1 overflow-hidden m-0 p-0">
                                    <RecallStudio documentId={id} selectedText={selectedText} initialSessionId={initialSessionId} />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </Panel>
                </Group>
            </div>
        </div>
    );
};

export default DocumentViewer;
