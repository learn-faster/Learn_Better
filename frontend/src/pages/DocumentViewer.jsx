import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
import api, { API_URL } from '../services/api';
import useTimerStore from '../stores/useTimerStore';
import { useTimer } from '../hooks/useTimer';
import FlashcardCreator from '../components/flashcards/FlashcardCreator';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';
import { Panel, Group, Separator } from 'react-resizable-panels';

// Open Notebook Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/open-notebook/ui/tabs';
import { ChatColumn } from '@/modules/open-notebook/components/ChatColumn';
import { NotesColumn } from '@/modules/open-notebook/components/NotesColumn';

// Register PDF worker - Using CDN to ensure version match
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
    const [zoom, setZoom] = useState(1);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [progress, setProgress] = useState(0);
    const [numPages, setNumPages] = useState(null);
    const [lastSavedTime, setLastSavedTime] = useState(0);

    // Open Notebook State
    const [contextSelections, setContextSelections] = useState({ sources: {}, notes: {} });
    const [activeTab, setActiveTab] = useState("chat");
    const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

    // Flashcard State
    const [flashcardFront, setFlashcardFront] = useState('');
    const [flashcardBack, setFlashcardBack] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const flashcardCreatorRef = React.useRef(null);
    const rightPanelRef = useRef(null);

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
            navigator.sendBeacon(`${API_URL}/api/documents/${id}/end-session`, payload);
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
        if (panel) {
            if (isRightPanelCollapsed) {
                panel.expand();
            } else {
                panel.collapse();
            }
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

    const fileName = getFileName(studyDoc.file_path);
    const isLink = studyDoc?.file_type === 'link';
    const fileUrl = isLink ? studyDoc.file_path : (fileName ? `${API_URL}/uploads/${fileName}` : '');

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
                        <div id="document-scroll-container" className="flex-1 overflow-auto custom-scrollbar" onScroll={handleScroll}>
                            <div className={`min-w-full min-h-full flex flex-col ${['pdf', 'image'].includes(studyDoc?.file_type) ? 'items-center py-12' : ''}`}>
                                {(studyDoc?.file_type === 'pdf' || studyDoc?.filename?.toLowerCase().endsWith('.pdf') || studyDoc?.file_path?.toLowerCase().endsWith('.pdf')) ? (
                                    <div className="w-full flex flex-col items-center py-8">
                                        <Document
                                            file={`${API_URL}/uploads/${fileName}`}
                                            onLoadSuccess={onDocumentLoadSuccess}
                                            className="flex flex-col items-center gap-4"
                                            loading={<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 my-20"></div>}
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
                        ref={rightPanelRef}
                        defaultSize={40}
                        minSize={20}
                        collapsible={true}
                        onCollapse={() => setIsRightPanelCollapsed(true)}
                        onExpand={() => setIsRightPanelCollapsed(false)}
                        className="bg-dark-900 border-l border-white/5"
                    >
                        <div className="h-full flex flex-col">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                                <div className="px-4 py-3 border-b border-white/5 bg-dark-900/80 backdrop-blur-sm">
                                    <TabsList className="grid w-full grid-cols-3 bg-white/5">
                                        <TabsTrigger value="chat" className="text-xs uppercase tracking-wider font-bold"><MessageSquare className="w-3.5 h-3.5 mr-2" />Chat</TabsTrigger>
                                        <TabsTrigger value="notes" className="text-xs uppercase tracking-wider font-bold"><StickyNote className="w-3.5 h-3.5 mr-2" />Notes</TabsTrigger>
                                        <TabsTrigger value="flashcards" className="text-xs uppercase tracking-wider font-bold"><Sparkles className="w-3.5 h-3.5 mr-2" />Cards</TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="chat" className="flex-1 overflow-hidden m-0 p-0">
                                    <ChatColumn notebookId={id} contextSelections={contextSelections} />
                                </TabsContent>

                                <TabsContent value="notes" className="flex-1 overflow-hidden m-0 p-0">
                                    <NotesColumn notebookId={id} contextSelections={contextSelections} />
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
                            </Tabs>
                        </div>
                    </Panel>
                </Group>
            </div>
        </div>
    );
};

export default DocumentViewer;
