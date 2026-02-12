import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Maximize2,
    ZoomIn,
    ZoomOut,
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
import { toast } from 'sonner';
import ConceptService from '../services/concepts';
import api from '../services/api';
import { getApiUrl } from '../lib/config';
import useTimerStore from '../stores/useTimerStore';
import { useTimer } from '../hooks/useTimer';
import FlashcardCreator from '../components/flashcards/FlashcardCreator';
import RecallStudio from '../components/documents/RecallStudio';
import { Document, Page, pdfjs } from 'react-pdf';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { DocumentLoadingState, DocumentErrorState, PdfErrorFallback } from '@/components/common/DocumentStates';
import DocumentMarkdownService from '@/services/documentMarkdown';
import DocumentQuizService from '@/services/documentQuiz';
import LlmConfigPanel from '@/components/ai/LlmConfigPanel';
import { LLM_PROVIDER_OPTIONS, MODEL_PRESETS } from '@/lib/llm-options';

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

const ensureTrailingSlash = (value) => {
    if (!value) return value;
    return value.endsWith('/') ? value : `${value}/`;
};

const PDF_PAGE_RATIO = 1.414;
const PDF_PAGE_GAP = 32;
const PAGE_RENDER_BUFFER = 6;
const THUMBNAIL_RENDER_BUFFER = 20;
const THUMBNAIL_BLOCK_HEIGHT = 216;

const LazyPage = ({ pageNumber, pageWidth, handleTextSelection }) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = React.useRef(null);
    const placeholderHeight = Math.max(400, Math.round(pageWidth * 1.414));

    useEffect(() => {
        const node = elementRef.current;
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

        if (node) {
            observer.observe(node);
        }

        return () => {
            if (node) {
                observer.unobserve(node);
            }
        };
    }, []);

    return (
        <div
            ref={elementRef}
            id={`page-${pageNumber}`}
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

const ThumbnailPage = ({ pageNumber, onSelect }) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = React.useRef(null);
    const thumbnailWidth = 140;
    const placeholderHeight = Math.max(180, Math.round(thumbnailWidth * 1.414));

    useEffect(() => {
        const node = elementRef.current;
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            {
                root: document.getElementById('document-thumbnail-container'),
                rootMargin: '100% 0px',
                threshold: 0
            }
        );

        if (node) {
            observer.observe(node);
        }

        return () => {
            if (node) {
                observer.unobserve(node);
            }
        };
    }, []);

    return (
        <div
            ref={elementRef}
            className="rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:border-primary-500/40 transition-colors cursor-pointer"
            onClick={onSelect}
        >
            {isVisible ? (
                <Page
                    pageNumber={pageNumber}
                    width={thumbnailWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={<div style={{ height: placeholderHeight }} className="bg-white/5 animate-pulse" />}
                />
            ) : (
                <div
                    className="bg-white/5 animate-pulse flex items-center justify-center text-dark-500 text-[10px] font-bold uppercase tracking-widest"
                    style={{ height: `${placeholderHeight}px` }}
                >
                    Page {pageNumber}
                </div>
            )}
            <div className="px-2 py-1 text-[9px] uppercase tracking-widest text-dark-400 text-center border-t border-white/5">
                {pageNumber}
            </div>
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
    const [highlightMenu, setHighlightMenu] = useState({ visible: false, x: 0, y: 0, text: '' });
    const [highlightQuestion, setHighlightQuestion] = useState('');
    const [highlightResult, setHighlightResult] = useState('');
    const [highlightLoading, setHighlightLoading] = useState(false);
    const [mdContent, setMdContent] = useState('');
    const [mdLoaded, setMdLoaded] = useState(false);
    const [mdSaving, setMdSaving] = useState(false);
    const [llmConfig, setLlmConfig] = useState({
        provider: 'openai',
        model: '',
        base_url: '',
        api_key: ''
    });
    const [llmTesting, setLlmTesting] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [progress, setProgress] = useState(0);
    const [numPages, setNumPages] = useState(null);
    const [lastSavedTime, setLastSavedTime] = useState(0);
    const [apiBaseUrl, setApiBaseUrl] = useState('');
    const [pdfError, setPdfError] = useState(null);
    const [ingestionError, setIngestionError] = useState(null);

    // Open Notebook State
    const [contextSelections] = useState({ sources: {}, notes: {} });
    const initialTab = searchParams.get('tab') || "chat";
    const initialSessionId = searchParams.get('sessionId') || null;
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
    const [sections, setSections] = useState([]);
    const [quality, setQuality] = useState(null);
    const [ingestionJob, setIngestionJob] = useState(null);
    const [isSectionBusy, setIsSectionBusy] = useState(false);
    const [navMode, setNavMode] = useState('sections');
    const [pageJump, setPageJump] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Flashcard State
    const [flashcardFront, setFlashcardFront] = useState('');
    const [flashcardBack, setFlashcardBack] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const flashcardCreatorRef = React.useRef(null);
    const rightPanelRef = usePanelRef();
    const leftPanelContainerRef = useRef(null);
    const initialScrollProgressRef = useRef(null);
    const programmaticScrollRef = useRef(false);
    const scrollRafRef = useRef(null);
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
    const downloadUrl = useMemo(
        () => (id ? `${apiPrefix}/documents/${id}/download` : ''),
        [apiPrefix, id]
    );
    const isLink = studyDoc?.file_type === 'link';
    const pdfFile = useMemo(
        () => (isLink ? studyDoc?.file_path : (downloadUrl || null)),
        [isLink, studyDoc?.file_path, downloadUrl]
    );
    const isPdf = !!(studyDoc?.file_type === 'pdf'
        || studyDoc?.filename?.toLowerCase().endsWith('.pdf')
        || studyDoc?.file_path?.toLowerCase().endsWith('.pdf'));
    const pdfOptions = useMemo(() => {
        const assetBase = ensureTrailingSlash('/pdfjs/');
        return {
            cMapUrl: ensureTrailingSlash(`${assetBase}cmaps`),
            cMapPacked: true,
            standardFontDataUrl: ensureTrailingSlash(`${assetBase}standard_fonts`)
        };
    }, []);
    const pageWidth = useMemo(
        () => Math.max(320, Math.floor((panelWidth || 900) * 0.92 * zoom)),
        [panelWidth, zoom]
    );
    const estimatedPageBlockHeight = useMemo(
        () => Math.max(420, Math.round(pageWidth * PDF_PAGE_RATIO)) + PDF_PAGE_GAP,
        [pageWidth]
    );
    const pageRenderStart = useMemo(
        () => Math.max(1, currentPage - PAGE_RENDER_BUFFER),
        [currentPage]
    );
    const pageRenderEnd = useMemo(
        () => Math.min(numPages || 0, currentPage + PAGE_RENDER_BUFFER),
        [currentPage, numPages]
    );
    const visiblePageNumbers = useMemo(() => {
        if (!numPages || pageRenderEnd < pageRenderStart) return [];
        return Array.from(
            { length: pageRenderEnd - pageRenderStart + 1 },
            (_, idx) => pageRenderStart + idx
        );
    }, [numPages, pageRenderStart, pageRenderEnd]);
    const topPageSpacerHeight = useMemo(
        () => Math.max(0, (pageRenderStart - 1) * estimatedPageBlockHeight),
        [pageRenderStart, estimatedPageBlockHeight]
    );
    const bottomPageSpacerHeight = useMemo(
        () => Math.max(0, ((numPages || 0) - pageRenderEnd) * estimatedPageBlockHeight),
        [numPages, pageRenderEnd, estimatedPageBlockHeight]
    );

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
            setIsLoading(true);
            setError(null);
            setPdfError(null);
            setNumPages(null);
            setCurrentPage(1);
            try {
                const data = await api.get(`/documents/${id}`);
                setStudyDoc(data);
                setIngestionError(data?.ingestion_error || null);
                const savedProgress = data.reading_progress || 0;
                setProgress(Math.round(savedProgress * 100));
                initialScrollProgressRef.current = Math.max(0, Math.min(1, savedProgress));
            } catch (err) {
                console.error('Failed to fetch document', err);
                setError(err?.userMessage || err?.message || 'Failed to load document');
            } finally {
                setIsLoading(false);
            }
        };
        fetchDoc();
    }, [id, navigate]);

    useEffect(() => {
        if (!studyDoc) return;
        if (studyDoc.file_type === 'markdown' || studyDoc.file_type === 'text') {
            setMdLoaded(false);
            DocumentMarkdownService.getMarkdown(id, { include_images: true, image_mode: 'base64' })
                .then((res) => {
                    setMdContent(res?.markdown || studyDoc.extracted_text || '');
                })
                .catch(() => {
                    setMdContent(studyDoc.extracted_text || '');
                })
                .finally(() => setMdLoaded(true));
        }
    }, [studyDoc, id]);

    useEffect(() => {
        if (!id) return;
        DocumentQuizService.getStudySettings(id)
            .then((data) => {
                if (data?.llm_config) {
                    setLlmConfig((prev) => ({ ...prev, ...data.llm_config }));
                }
            })
            .catch(() => {});
    }, [id]);

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
        if (!ingestionJob || !['running', 'pending'].includes(ingestionJob.status)) {
            return;
        }
        const interval = setInterval(async () => {
            try {
                const jobRes = await api.get(`/documents/${id}/ingestion`);
                setIngestionJob(jobRes);
            } catch {
                // ignore polling errors
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [ingestionJob, id]);

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    useEffect(() => {
        if (!isPdf && navMode === 'thumbnails') {
            setNavMode('sections');
        }
    }, [isPdf, navMode]);

    useEffect(() => {
        return () => {
            if (scrollRafRef.current) {
                cancelAnimationFrame(scrollRafRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleClick = () => {
            setHighlightMenu((prev) => ({ ...prev, visible: false }));
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        const handleKey = (event) => {
            if (event.key === 'Escape') {
                setHighlightMenu((prev) => ({ ...prev, visible: false }));
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);


    const handleScroll = useCallback((e) => {
        if (programmaticScrollRef.current) return;
        const container = e.target;
        if (scrollRafRef.current) {
            cancelAnimationFrame(scrollRafRef.current);
        }
        scrollRafRef.current = requestAnimationFrame(() => {
            const denom = Math.max(1, container.scrollHeight - container.clientHeight);
            const scrollPercentage = container.scrollTop / denom;
            const newProgress = Math.round(scrollPercentage * 100);
            setProgress((prev) => (Math.abs(newProgress - prev) > 1 ? newProgress : prev));

            if (numPages) {
                const estimated = Math.floor(container.scrollTop / Math.max(1, estimatedPageBlockHeight)) + 1;
                const nextPage = Math.min(numPages, Math.max(1, estimated));
                setCurrentPage((prev) => (prev !== nextPage ? nextPage : prev));
            }
        });
    }, [estimatedPageBlockHeight, numPages]);

    const scrollToPage = useCallback((pageNumber) => {
        const container = window.document.getElementById('document-scroll-container');
        if (!container) return;
        const target = window.document.getElementById(`page-${pageNumber}`);
        programmaticScrollRef.current = true;
        if (target) {
            const containerRect = container.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            container.scrollTo({
                top: container.scrollTop + (targetRect.top - containerRect.top) - 24,
                behavior: 'smooth'
            });
        } else {
            const fallbackTop = Math.max(0, (pageNumber - 1) * estimatedPageBlockHeight);
            container.scrollTo({ top: fallbackTop, behavior: 'smooth' });
        }
        setCurrentPage(pageNumber);
        setTimeout(() => {
            programmaticScrollRef.current = false;
        }, 220);
    }, [estimatedPageBlockHeight]);

    const handleJump = () => {
        const pageNum = parseInt(pageJump, 10);
        if (!pageNum || pageNum < 1) return;
        const totalPages = numPages || studyDoc?.page_count || 0;
        const clamped = totalPages ? Math.min(pageNum, totalPages) : pageNum;
        scrollToPage(clamped);
        setPageJump('');
    };

    const pageForSection = useCallback((section, index) => {
        if (section?.page_start) {
            return section.page_start;
        }
        const totalPages = numPages || studyDoc?.page_count || 0;
        if (!totalPages) return 1;
        const totalSections = Math.max(sections.length - 1, 1);
        const idx = section?.section_index ?? index;
        return Math.max(1, Math.round((idx / totalSections) * (totalPages - 1)) + 1);
    }, [numPages, studyDoc?.page_count, sections.length]);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        setPdfError(null);
    };

    useEffect(() => {
        const saved = initialScrollProgressRef.current;
        if (saved == null) return;
        if (!numPages) return;
        const container = window.document.getElementById('document-scroll-container');
        if (!container) return;
        const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
        programmaticScrollRef.current = true;
        container.scrollTop = Math.round(maxScroll * saved);
        setTimeout(() => {
            programmaticScrollRef.current = false;
        }, 120);
        initialScrollProgressRef.current = null;
    }, [numPages]);

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() || '';
        if (!text) {
            return;
        }
        setSelectedText(text);
        try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const menuWidth = 260;
            const menuHeight = 180;
            const padding = 12;
            const maxX = window.scrollX + window.innerWidth - menuWidth - padding;
            const maxY = window.scrollY + window.innerHeight - menuHeight - padding;
            const nextX = Math.min(Math.max(rect.left + window.scrollX, window.scrollX + padding), maxX);
            const nextY = Math.min(Math.max(rect.top + window.scrollY - 8, window.scrollY + padding), maxY);
            setHighlightMenu({
                visible: true,
                x: nextX,
                y: nextY,
                text
            });
            setHighlightQuestion('');
            setHighlightResult('');
        } catch {
            setHighlightMenu({ visible: false, x: 0, y: 0, text: '' });
        }
    }, []);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));

    const showToast = (message, type = 'success') => {
        if (type === 'error') {
            toast.error(message);
            return;
        }
        toast.success(message);
    };

    const runHighlightAction = async (action) => {
        if (!highlightMenu.text) return;
        setHighlightLoading(true);
        setHighlightResult('');
        try {
            const res = await DocumentMarkdownService.highlightAction(id, {
                action,
                selection_text: highlightMenu.text,
                question: highlightQuestion || null,
                llm_config: llmConfig
            });
            setHighlightResult(res?.output || '');
        } catch (err) {
            showToast(err?.userMessage || err?.message || 'LLM action failed', 'error');
        } finally {
            setHighlightLoading(false);
        }
    };

    const handleSaveMarkdown = async () => {
        if (!mdContent) return;
        setMdSaving(true);
        try {
            await DocumentMarkdownService.saveMarkdown(id, { markdown: mdContent });
            showToast('Markdown saved');
        } catch (err) {
            showToast(err?.userMessage || err?.message || 'Failed to save markdown', 'error');
        } finally {
            setMdSaving(false);
        }
    };

    useEffect(() => {
        const handleKey = (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                handleSaveMarkdown();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleSaveMarkdown]);

    const handleTestLlm = async () => {
        setLlmTesting(true);
        try {
            const result = await DocumentQuizService.testLlm({
                prompt: 'Say hello in one line.',
                llm_config: llmConfig
            });
            showToast(`LLM OK • ${result?.latency_ms || 'n/a'}ms`);
        } catch (err) {
            showToast(err?.userMessage || err?.message || 'LLM test failed', 'error');
        } finally {
            setLlmTesting(false);
        }
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
        if (!studyDoc?.extracted_text) {
            showToast('Document is still processing. Wait for extraction to finish, then try again.', 'error');
            return;
        }
        setIsExtracting(true);
        try {
            await api.post(`/documents/${id}/synthesize`);
            showToast('Graph synthesis queued.', 'success');
            try {
                const jobRes = await api.get(`/documents/${id}/ingestion`);
                setIngestionJob(jobRes);
            } catch {
                // ignore polling failure
            }
        } catch (err) {
            console.error(err);
            const errorMessage = err?.userMessage || err?.message || 'Graph synthesis failed';
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
        return <DocumentLoadingState message="Loading document..." />;
    }

    if (error || !studyDoc) {
        return (
            <DocumentErrorState
                error={error || 'Document not found'}
                onBack={() => navigate('/documents')}
                onRetry={() => window.location.reload()}
            />
        );
    }

    const fileUrl = isLink ? studyDoc.file_path : downloadUrl;

    return (
        <div className={`flex flex-col bg-dark-950 transition-all duration-300 ${isFocusMode ? 'fixed inset-0 z-[60] p-0 h-screen' : 'h-[calc(100vh-4rem)]'}`}>
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
                                {numPages ? (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-white/10" />
                                        <span className="text-[10px] text-dark-500 font-semibold uppercase tracking-widest">
                                            Page {currentPage}/{numPages}
                                        </span>
                                    </>
                                ) : null}
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
                                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isTimerActive ? 'bg-primary-500/10 text-primary-300' : 'bg-primary-500/10 text-primary-500'}`}
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
                                disabled={isExtracting || !studyDoc?.extracted_text}
                                className={`p-2.5 rounded-xl transition-all border border-transparent ${isExtracting ? 'text-primary-400 animate-pulse' : (!studyDoc?.extracted_text ? 'text-dark-600 cursor-not-allowed' : 'text-dark-400 hover:bg-white/5 hover:border-white/10')}`}
                                title={studyDoc?.extracted_text ? "Map Concepts (AI)" : "Processing not complete"}
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
                        <div className="flex-1 flex overflow-hidden">
                            <aside className="hidden lg:flex w-64 flex-col border-r border-white/5 bg-dark-900/80">
                                <div className="px-4 pt-5 pb-3 border-b border-white/5">
                                    <p className="text-[10px] uppercase tracking-widest text-dark-500 font-bold">Navigator</p>
                                    <div className="mt-3 flex bg-white/5 p-1 rounded-lg">
                                        <button
                                            onClick={() => setNavMode('pages')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${navMode === 'pages' ? 'bg-white/10 text-white' : 'text-dark-400 hover:text-white'}`}
                                        >
                                            Pages
                                        </button>
                                        <button
                                            onClick={() => setNavMode('sections')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${navMode === 'sections' ? 'bg-white/10 text-white' : 'text-dark-400 hover:text-white'}`}
                                        >
                                            Sections
                                        </button>
                                        {isPdf && (
                                            <button
                                                onClick={() => setNavMode('thumbnails')}
                                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${navMode === 'thumbnails' ? 'bg-white/10 text-white' : 'text-dark-400 hover:text-white'}`}
                                            >
                                                Thumbs
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
                                    {navMode === 'pages' ? (
                                        <div className="space-y-3">
                                            <label className="text-[10px] uppercase tracking-widest text-dark-500 font-bold">Jump to Page</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={pageJump}
                                                    onChange={(e) => setPageJump(e.target.value)}
                                                    className="w-full bg-dark-900/60 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center font-bold"
                                                />
                                                <button onClick={handleJump} className="btn-secondary px-3 py-2 text-xs">Go</button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => scrollToPage(1)}
                                                    className="flex-1 text-[10px] font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 rounded-lg py-2"
                                                >
                                                    Top
                                                </button>
                                                <button
                                                    onClick={() => scrollToPage(numPages || studyDoc?.page_count || 1)}
                                                    className="flex-1 text-[10px] font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 rounded-lg py-2"
                                                >
                                                    End
                                                </button>
                                            </div>
                                            {numPages && numPages <= 24 && (
                                                <div className="grid grid-cols-6 gap-2 text-[10px]">
                                                    {Array.from({ length: numPages }, (_, idx) => (
                                                        <button
                                                            key={`nav_${idx + 1}`}
                                                            onClick={() => scrollToPage(idx + 1)}
                                                            className="py-1 rounded-md bg-dark-900/60 border border-white/10 hover:border-primary-500/40 text-dark-200"
                                                        >
                                                            {idx + 1}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : navMode === 'thumbnails' && isPdf && pdfFile ? (
                                        <div id="document-thumbnail-container" className="space-y-3">
                                            {numPages ? (
                                                <Document
                                                    file={pdfFile}
                                                    options={pdfOptions}
                                                    loading={<div className="text-xs text-dark-500">Loading thumbnails...</div>}
                                                >
                                                    {numPages > 80 && (
                                                        <div style={{ height: `${Math.max(0, (Math.max(1, currentPage - THUMBNAIL_RENDER_BUFFER) - 1) * THUMBNAIL_BLOCK_HEIGHT)}px` }} />
                                                    )}
                                                    {Array.from(
                                                        {
                                                            length:
                                                                (numPages > 80
                                                                    ? Math.min(
                                                                        numPages,
                                                                        currentPage + THUMBNAIL_RENDER_BUFFER
                                                                    ) - Math.max(1, currentPage - THUMBNAIL_RENDER_BUFFER) + 1
                                                                    : numPages)
                                                        },
                                                        (_, idx) => (numPages > 80
                                                            ? Math.max(1, currentPage - THUMBNAIL_RENDER_BUFFER) + idx
                                                            : idx + 1)
                                                    ).map((pageNum) => (
                                                        <ThumbnailPage
                                                            key={`thumb_${pageNum}`}
                                                            pageNumber={pageNum}
                                                            onSelect={() => scrollToPage(pageNum)}
                                                        />
                                                    ))}
                                                    {numPages > 80 && (
                                                        <div style={{ height: `${Math.max(0, (numPages - Math.min(numPages, currentPage + THUMBNAIL_RENDER_BUFFER)) * THUMBNAIL_BLOCK_HEIGHT)}px` }} />
                                                    )}
                                                </Document>
                                            ) : (
                                                <div className="text-xs text-dark-500">Preparing thumbnails...</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {sections.length === 0 && (
                                                <div className="text-xs text-dark-500">No sections available yet.</div>
                                            )}
                                            {sections.map((section, index) => (
                                                <button
                                                    key={section.id}
                                                    onClick={() => scrollToPage(pageForSection(section, index))}
                                                    className="w-full text-left p-3 rounded-xl bg-dark-900/50 border border-white/5 hover:border-primary-500/40 transition-all"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-bold text-white truncate">
                                                            {section.title || `Section ${section.section_index + 1}`}
                                                        </p>
                                                        <span className={`text-[9px] uppercase tracking-widest font-bold ${section.included ? 'text-primary-300' : 'text-dark-500'}`}>
                                                            {section.included ? 'Included' : 'Optional'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-dark-400 line-clamp-2 mt-1">
                                                        {section.excerpt || section.content?.slice(0, 120)}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </aside>

                            <div
                                id="document-scroll-container"
                                ref={leftPanelContainerRef}
                                className="flex-1 overflow-auto custom-scrollbar"
                                onScroll={handleScroll}
                            >
                                {ingestionError && (
                                    <div className="mx-6 mt-6 mb-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 px-4 py-3 text-sm">
                                        {ingestionError}
                                    </div>
                                )}
                                <div className={`min-w-full min-h-full flex flex-col ${['pdf', 'image'].includes(studyDoc?.file_type) ? 'items-center py-10' : ''}`}>
                                    {(studyDoc?.file_type === 'pdf' || studyDoc?.filename?.toLowerCase().endsWith('.pdf') || studyDoc?.file_path?.toLowerCase().endsWith('.pdf')) ? (
                                        <div className="w-full flex flex-col items-center py-8 px-4">
                                            {pdfFile ? (
                                                <ErrorBoundary fallback={PdfErrorFallback}>
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
                                                        {numPages && !pdfError && (
                                                            <>
                                                                {topPageSpacerHeight > 0 && (
                                                                    <div style={{ height: `${topPageSpacerHeight}px`, width: '100%' }} />
                                                                )}
                                                                {visiblePageNumbers.map((pageNum) => (
                                                                    <LazyPage
                                                                        key={`page_${pageNum}`}
                                                                        pageNumber={pageNum}
                                                                        pageWidth={pageWidth}
                                                                        handleTextSelection={handleTextSelection}
                                                                    />
                                                                ))}
                                                                {bottomPageSpacerHeight > 0 && (
                                                                    <div style={{ height: `${bottomPageSpacerHeight}px`, width: '100%' }} />
                                                                )}
                                                            </>
                                                        )}
                                                        {!numPages && !pdfError && (
                                                            <div className="text-dark-400 text-sm py-10">Preparing pages...</div>
                                                        )}
                                                    </Document>
                                                </ErrorBoundary>
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
                                            <div className="w-full max-w-6xl bg-dark-900/50 backdrop-blur-md rounded-[2.5rem] border border-white/10 shadow-2xl p-8 md:p-12 relative">
                                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-widest text-dark-500 font-bold">Markdown Workspace</p>
                                                        <h3 className="text-white font-black text-xl mt-1">Edit, Highlight, and Ask the LLM</h3>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={handleSaveMarkdown}
                                                            disabled={mdSaving || !mdContent}
                                                            className="px-3 py-2 rounded-xl text-[10px] uppercase tracking-widest font-black bg-primary-500/20 text-primary-200 border border-primary-400/30 hover:bg-primary-500/30 transition-all disabled:opacity-60"
                                                        >
                                                            {mdSaving ? 'Saving...' : 'Save Markdown'}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                    <div className="lg:col-span-2" onMouseUp={handleTextSelection}>
                                                        {!mdLoaded && (
                                                            <div className="h-[240px] rounded-2xl bg-white/5 animate-pulse" />
                                                        )}
                                                        {mdLoaded && (
                                                            <MarkdownEditor
                                                                value={mdContent}
                                                                onChange={setMdContent}
                                                                height={720}
                                                                className="rounded-2xl border border-white/10"
                                                            />
                                                        )}
                                                    </div>

                                                    <div className="lg:col-span-1 space-y-4">
                                                        <LlmConfigPanel
                                                            value={llmConfig}
                                                            onChange={setLlmConfig}
                                                            providers={LLM_PROVIDER_OPTIONS}
                                                            modelPresets={MODEL_PRESETS}
                                                            onTest={handleTestLlm}
                                                            testing={llmTesting}
                                                            showPrompt={false}
                                                            helper="Used for highlight actions and grading inside this document."
                                                        />

                                                        <div className="p-4 rounded-2xl border border-white/10 bg-dark-950/40">
                                                            <p className="text-[10px] uppercase tracking-widest text-dark-500 font-bold">Highlight Actions</p>
                                                            <p className="text-[11px] text-dark-400 mt-2">
                                                                Highlight text in the editor to ask, explain, or summarize.
                                                            </p>
                                                            {highlightResult && (
                                                                <div className="mt-3 text-xs text-white/80 whitespace-pre-wrap bg-white/5 p-3 rounded-xl">
                                                                    {highlightResult}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
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
                                        sections={sections}
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
                                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${section.included ? 'bg-primary-500/10 text-primary-300 border-primary-500/30' : 'bg-white/5 text-dark-400 border-white/10'}`}
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
            {highlightMenu.visible && (
                <div
                    className="fixed z-[80] bg-dark-900/95 border border-white/10 rounded-2xl shadow-2xl p-3 min-w-[220px]"
                    style={{ top: highlightMenu.y, left: highlightMenu.x }}
                    onMouseDown={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-label="Highlight actions"
                    tabIndex={-1}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <button
                            onClick={() => runHighlightAction('ask')}
                            className="px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest font-black bg-primary-500/20 text-primary-200 border border-primary-400/30"
                            disabled={highlightLoading}
                        >
                            Ask
                        </button>
                        <button
                            onClick={() => runHighlightAction('explain')}
                            className="px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest font-black bg-white/5 text-white border border-white/10"
                            disabled={highlightLoading}
                        >
                            Explain
                        </button>
                        <button
                            onClick={() => runHighlightAction('summarize')}
                            className="px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest font-black bg-white/5 text-white border border-white/10"
                            disabled={highlightLoading}
                        >
                            Summarize
                        </button>
                    </div>
                    <input
                        value={highlightQuestion}
                        onChange={(e) => setHighlightQuestion(e.target.value)}
                        placeholder="Ask a question..."
                        className="w-full rounded-lg bg-dark-950 border border-white/10 px-2 py-1 text-[11px] text-white mb-2"
                    />
                    {highlightLoading && (
                        <div className="text-[10px] text-dark-400">Thinking...</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DocumentViewer;
