import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import {
    Network,
    Zap,
    Search,
    ChevronRight,
    Loader2,
    HelpCircle,
    X,
    MousePointer2,
    Move,
    Maximize2,
    BookOpen,
    MonitorPlay,
    Timer,
    Compass,
    Sparkles,
    CheckCircle2,
    Target,
    Lock,
    Plus,
    SlidersHorizontal,
    Link2
} from 'lucide-react';
import GraphService from '../services/graphs';
import ResourceService from '../services/resources';
import useTimerStore from '../stores/useTimerStore';
import useDocumentStore from '../stores/useDocumentStore';
import { Card } from '../components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import InlineErrorBanner from '../components/common/InlineErrorBanner';
import { getRecommendedExtractionSettings } from '../lib/utils/modelLimits';
import aiSettings from '../services/aiSettings';

/**
 * Premium Starfield Background with multiple parallax layers
 */
const Starfield = () => (
    <div className="universe-stars overflow-hidden pointer-events-none">
        <div className="star-layer-1 absolute inset-0 opacity-50" />
        <div className="star-layer-2 absolute inset-0 opacity-40 animate-pulse" />
        <div className="absolute inset-0 cosmic-nebula opacity-30" />
    </div>
);

/**
 * Neural Construction HUD
 * Displays real-time progress of knowledge graph generation.
 */
const ConstructionHUD = ({ documents }) => {
    if (!documents || documents.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 left-10 z-30 w-80 flex flex-col gap-2 pointer-events-none"
        >
            {documents.map(doc => {
                const phase = (doc.ingestion_step || '').toLowerCase();
                const jobStatus = doc.ingestion_job_status;
                const jobMessage = doc.ingestion_job_message || '';
                const isRateLimited = phase === 'rate_limited'
                    || jobStatus === 'paused'
                    || jobMessage.toLowerCase().includes('rate limit');
                return (
                    <div key={doc.id} className="p-4 glass-morphism rounded-2xl border border-white/10 shadow-[0_0_15px_rgba(220,214,247,0.18)] backdrop-blur-md relative overflow-hidden">
                        {/* Scanline Effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent animate-scan" />

                        <div className="flex justify-between items-start mb-2 relative z-10">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Neural Construction</span>
                                {isRateLimited && (
                                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-200 border border-primary-500/30">
                                        Paused (rate limited)
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-bold text-white/60">{doc.ingestion_progress || 0}%</span>
                        </div>

                        <h4 className="text-sm font-bold text-white mb-1 truncate relative z-10">{doc.title}</h4>
                        <p className="text-[10px] text-white/50 font-mono mb-3 relative z-10">
                            {doc.ingestion_step ? `> ${doc.ingestion_step}` : '> INITIALIZING UPLINK...'}
                        </p>

                        <div className="h-1 bg-dark-900/50 rounded-full overflow-hidden relative z-10">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${doc.ingestion_progress || 5}%` }}
                                transition={{ ease: "linear" }}
                                className="h-full bg-white/80 shadow-[0_0_10px_rgba(220,214,247,0.35)]"
                            />
                        </div>
                    </div>
                );
            })}
        </motion.div>
    );
};

/**
 * Knowledge Map Page Component.
 * Optimized for clarity, premium aesthetics, and smart navigation.
 */
const KnowledgeGraph = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { startSession } = useTimerStore();
    const { documents, fetchDocuments } = useDocumentStore();

    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [graphs, setGraphs] = useState([]);
    const [selectedGraphId, setSelectedGraphId] = useState(null);
    const [isGraphLoading, setIsGraphLoading] = useState(false);
    const [showGraphModal, setShowGraphModal] = useState(false);
    const [showBuildModal, setShowBuildModal] = useState(false);
    const [editingGraph, setEditingGraph] = useState(null);
    const [graphForm, setGraphForm] = useState({
        name: '',
        description: '',
        document_ids: [],
        extraction_max_chars: 4000,
        chunk_size: 1500
    });
    const [buildMode, setBuildMode] = useState('existing');
    const [buildSourceMode, setBuildSourceMode] = useState('filtered');
    const [buildExtractionMaxChars, setBuildExtractionMaxChars] = useState('');
    const [buildChunkSize, setBuildChunkSize] = useState('');
    const [buildError, setBuildError] = useState('');
    const [showConnections, setShowConnections] = useState(false);
    const [showCrossLinks, setShowCrossLinks] = useState(true);
    const [targetGraphId, setTargetGraphId] = useState('');
    const [connectionContext, setConnectionContext] = useState('');
    const [connectionSuggestions, setConnectionSuggestions] = useState([]);
    const [selectedConnections, setSelectedConnections] = useState(new Set());
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showGuide, setShowGuide] = useState(false);
    const [guideDismissed, setGuideDismissed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('kgGuideDismissed') === '1';
    });
    const [showManageMenu, setShowManageMenu] = useState(false);
    const [showViewMenu, setShowViewMenu] = useState(false);
    const [lastGraphRefreshAt, setLastGraphRefreshAt] = useState(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [graphError, setGraphError] = useState('');

    const [activeNeighbors, setActiveNeighbors] = useState(new Set());
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Concept Tutor State (Active Intel)
    const [activeIntel, setActiveIntel] = useState(null);
    const [isLoadingIntel, setIsLoadingIntel] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [kgLlmConfig, setKgLlmConfig] = useState({ provider: null, model: null, source: 'global' });
    const recommendedSettings = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const provider = kgLlmConfig?.provider || localStorage.getItem('llm_provider');
        const model = kgLlmConfig?.model || localStorage.getItem('llm_model');
        return getRecommendedExtractionSettings(provider, model);
    }, [kgLlmConfig?.provider, kgLlmConfig?.model]);

    const fgRef = useRef();
    const containerRef = useRef();
    const manageMenuRef = useRef();
    const viewMenuRef = useRef();
    const selectedGraph = useMemo(
        () => graphs.find(g => g.id === selectedGraphId),
        [graphs, selectedGraphId]
    );

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        const onFullscreenChange = () => {
            const active = Boolean(document.fullscreenElement);
            setIsFullscreen(active);
            if (!active) {
                setIsFocusMode(false);
            }
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (manageMenuRef.current && !manageMenuRef.current.contains(event.target)) {
                setShowManageMenu(false);
            }
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target)) {
                setShowViewMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const docIdParam = params.get('docId');
        if (docIdParam) {
            setShowGraphModal(true);
            setEditingGraph(null);
            setGraphForm((prev) => ({
                ...prev,
                document_ids: [Number(docIdParam)],
            }));
        }
    }, [location.search]);

    useEffect(() => {
        const loadAiSettings = async () => {
            try {
                const data = await aiSettings.get();
                const llmConfig = data?.llm || {};
                const override = llmConfig?.knowledge_graph || {};
                const global = llmConfig?.global || {};
                const hasOverride = override && Object.values(override).some((val) => val);
                const resolved = hasOverride ? override : global;
                setKgLlmConfig({
                    provider: resolved?.provider || null,
                    model: resolved?.model || null,
                    source: hasOverride ? 'override' : 'global'
                });
            } catch {
                // Leave defaults if settings are unavailable.
            }
        };
        loadAiSettings();
    }, []);

    const loadGraphs = async () => {
        try {
            const data = await GraphService.listGraphs();
            setGraphs(data || []);
            if (!selectedGraphId && data && data.length > 0) {
                setSelectedGraphId(data[0].id);
            }
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to load graphs.';
            setGraphError(msg);
            toast.error(msg);
        }
    };

    const openCreateGraph = () => {
        setEditingGraph(null);
        setGraphForm({
            name: '',
            description: '',
            document_ids: [],
            extraction_max_chars: 4000,
            chunk_size: 1500
        });
        setShowGraphModal(true);
    };

    const openEditGraph = (graph) => {
        setEditingGraph(graph);
        setGraphForm({
            name: graph.name || '',
            description: graph.description || '',
            document_ids: graph.document_ids || [],
            extraction_max_chars: graph.extraction_max_chars || 4000,
            chunk_size: graph.chunk_size || 1500
        });
        setBuildMode('existing');
        setBuildSourceMode('filtered');
        setShowGraphModal(true);
    };

    const handleSaveGraph = async () => {
        try {
            const payload = {
                name: graphForm.name,
                description: graphForm.description,
                document_ids: graphForm.document_ids,
                extraction_max_chars: graphForm.extraction_max_chars,
                chunk_size: graphForm.chunk_size
            };
            let saved;
            if (editingGraph) {
                saved = await GraphService.updateGraph(editingGraph.id, payload);
                toast.success('Graph configuration updated.');
            } else {
                saved = await GraphService.createGraph(payload);
                toast.success('Graph created successfully.');
            }
            await loadGraphs();
            if (saved) setSelectedGraphId(saved.id);
            setShowGraphModal(false);
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to save graph.';
            setGraphError(msg);
            toast.error(msg);
        }
    };

    const handleSaveAndBuild = async () => {
        if (!graphForm.name.trim()) {
            toast.error('Graph name is required');
            return;
        }
        setBuildError('');
        setIsGraphLoading(true);
        try {
            // 1. Save settings first
            const payload = {
                name: graphForm.name,
                description: graphForm.description,
                document_ids: graphForm.document_ids,
                extraction_max_chars: graphForm.extraction_max_chars,
                chunk_size: graphForm.chunk_size
            };

            let saved;
            if (editingGraph) {
                saved = await GraphService.updateGraph(editingGraph.id, payload);
            } else {
                saved = await GraphService.createGraph(payload);
            }

            const targetGraphId = saved.id;
            await loadGraphs();
            setSelectedGraphId(targetGraphId);

            // 2. Trigger build
            const buildPayload = {
                build_mode: buildMode,
                source_mode: buildSourceMode,
                extraction_max_chars: graphForm.extraction_max_chars,
                chunk_size: graphForm.chunk_size
            };

            await GraphService.buildGraph(targetGraphId, buildPayload, { wait: false });
            await fetchGraph(true);
            setShowGraphModal(false);
            toast.success('Graph saved and build initiated.');
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to save and build graph.';
            setBuildError(msg);
            toast.error(msg);
        } finally {
            setIsGraphLoading(false);
        }
    };

    const toggleDocumentSelection = (docId) => {
        setGraphForm((prev) => {
            const has = prev.document_ids.includes(docId);
            return {
                ...prev,
                document_ids: has
                    ? prev.document_ids.filter(id => id !== docId)
                    : [...prev.document_ids, docId]
            };
        });
    };

    const handleBuildGraph = async () => {
        if (!selectedGraphId) return;
        setBuildError('');
        setIsGraphLoading(true);
        try {
            const payload = { build_mode: buildMode, source_mode: buildSourceMode };
            const maxChars = Number(buildExtractionMaxChars);
            const chunkSize = Number(buildChunkSize);
            if (Number.isFinite(maxChars) && maxChars > 0) payload.extraction_max_chars = maxChars;
            if (Number.isFinite(chunkSize) && chunkSize > 0) payload.chunk_size = chunkSize;
            await GraphService.buildGraph(selectedGraphId, payload, { wait: false });
            await fetchGraph(true);
            await loadGraphs();
            setShowBuildModal(false);
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to build graph.';
            setBuildError(msg);
            setGraphError(msg);
            await loadGraphs();
            toast.error(msg);
        } finally {
            setIsGraphLoading(false);
        }
    };

    useEffect(() => {
        if (!showBuildModal || !isGraphLoading) return;
        const interval = setInterval(() => {
            loadGraphs();
        }, 2000);
        return () => clearInterval(interval);
    }, [showBuildModal, isGraphLoading, loadGraphs]);

    const fetchGraph = async (showSyncEffect = false) => {
        if (!selectedGraphId) return;
        if (graphData.nodes.length === 0 && !showSyncEffect) setIsLoading(true);

        try {
            const data = await GraphService.getGraphData(selectedGraphId, showCrossLinks);
            if (!data || !data.nodes) {
                setGraphData({ nodes: [], links: [] });
                return;
            }

            const nodes = data.nodes.map(n => ({ ...n, id: String(n.id) }));
            const nodeIds = new Set(nodes.map(n => n.id));

            const sanitizedLinks = (data.links || []).filter(link => {
                const s = String(link.source?.id || link.source);
                const t = String(link.target?.id || link.target);
                return nodeIds.has(s) && nodeIds.has(t);
            });

            const degrees = {};
            sanitizedLinks.forEach(link => {
                const s = String(link.source?.id || link.source);
                const t = String(link.target?.id || link.target);
                degrees[s] = (degrees[s] || 0) + 1;
                degrees[t] = (degrees[t] || 0) + 1;
            });

            const sizedNodes = nodes.map(node => ({
                ...node,
                val: 4 + Math.min((degrees[node.id] || 0) * 1.5, 14)
            }));

            setGraphData({ nodes: sizedNodes, links: sanitizedLinks });
            setLastGraphRefreshAt(new Date());

            if (graphData.nodes.length === 0) {
                setTimeout(() => {
                    if (fgRef.current) {
                        fgRef.current.zoomToFit(800, 50);
                    }
                }, 600);
            }

            if (data.nodes.length === 0 && !showSyncEffect && !guideDismissed) setShowGuide(true);
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to fetch graph.';
            setGraphError(msg);
            if (showSyncEffect) {
                toast.error(msg);
            }
            if (graphData.nodes.length === 0) setGraphData({ nodes: [], links: [] });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggestConnections = async () => {
        if (!selectedGraphId || !targetGraphId || !connectionContext.trim()) return;
        setIsSuggesting(true);
        try {
            const data = await GraphService.suggestConnections(selectedGraphId, {
                target_graph_id: targetGraphId,
                context: connectionContext,
                max_links: 20
            });
            const list = data?.connections || [];
            setConnectionSuggestions(list);
            setSelectedConnections(new Set(list.map((_, idx) => idx)));
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to suggest connections.';
            setGraphError(msg);
            toast.error(msg);
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleSaveConnections = async () => {
        if (!selectedGraphId || !targetGraphId) return;
        const connections = connectionSuggestions.filter((_, idx) => selectedConnections.has(idx));
        try {
            await GraphService.saveConnections(selectedGraphId, {
                target_graph_id: targetGraphId,
                context: connectionContext,
                connections: connections.map(c => ({
                    from_scoped_id: c.from_scoped_id,
                    to_scoped_id: c.to_scoped_id,
                    confidence: c.confidence || 0.5,
                    rationale: c.rationale || ''
                })),
                method: 'llm'
            });
            setShowConnections(false);
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to save connections.';
            setGraphError(msg);
            toast.error(msg);
        }
    };

    useEffect(() => {
        if (!fgRef.current) return;

        // Tighten the simulation significantly
        fgRef.current.d3Force('charge').strength(-15);
        fgRef.current.d3Force('link').distance(25);
        fgRef.current.d3Force('center').strength(0.2);
    }, [graphData]);

    // Polling for Construction Updates
    useEffect(() => {
        let interval;
        let isActive = true;
        const checkStatus = async () => {
            if (!isActive || document.visibilityState !== 'visible') return;
            await fetchDocuments(true, { minIntervalMs: 8000 });
            const isIngesting = documents.some(d => d.status === 'ingesting' || d.status === 'processing');
            if (isIngesting) {
                fetchGraph(false);
            }
        };

        const hasActiveJobs = documents.some(d => d.status === 'ingesting');
        if (hasActiveJobs) {
            interval = setInterval(checkStatus, 4000);
        } else {
            checkStatus();
            interval = setInterval(checkStatus, 15000);
        }

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                checkStatus();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            isActive = false;
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [documents.length, selectedGraphId]);

    useEffect(() => {
        loadGraphs();
        fetchDocuments();
    }, []);

    useEffect(() => {
        if (selectedGraphId) {
            fetchGraph();
        } else {
            setGraphData({ nodes: [], links: [] });
        }
    }, [selectedGraphId, showCrossLinks]);

    useEffect(() => {
        if (!selectedGraphId || selectedGraph?.status !== 'building') return;
        const interval = setInterval(() => {
            loadGraphs();
            fetchGraph(true);
        }, 6000);
        return () => clearInterval(interval);
    }, [selectedGraphId, selectedGraph?.status]);

    useEffect(() => {
        if (graphData.nodes.length > 0 && showGuide) {
            setShowGuide(false);
        }
    }, [graphData.nodes.length, showGuide]);

    // Smart Search Logic
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchSuggestions([]);
            return;
        }
        const lowerQuery = searchQuery.toLowerCase();
        const suggestions = graphData.nodes
            .filter(n => (n.name || '').toLowerCase().includes(lowerQuery))
            .slice(0, 5); // Limit suggestions
        setSearchSuggestions(suggestions);
    }, [searchQuery, graphData.nodes]);

    const handleSelectSuggestion = (node) => {
        setSearchQuery(node.name);
        setSearchSuggestions([]);
        handleNodeFocus(node);
    };

    const handleNodeFocus = (node) => {
        if (!node || typeof node.x !== 'number' || !fgRef.current) return;
        setSelectedNode(node);
        setActiveTab('overview');
        setActiveIntel(null);

        // Robust Neighbor Detection (Handle strings and inflated objects)
        const neighbors = new Set();
        (graphData.links || []).forEach(link => {
            if (!link) return;
            const sId = String(link.source?.id || link.source);
            const tId = String(link.target?.id || link.target);
            const nId = String(node.id);

            if (sId === nId) neighbors.add(tId);
            if (tId === nId) neighbors.add(sId);
        });
        setActiveNeighbors(neighbors);

        fgRef.current.centerAt(node.x, node.y, 800);
        fgRef.current.zoom(3, 800);
    };

    const toggleFocusMode = async () => {
        if (!containerRef.current) return;
        try {
            if (!document.fullscreenElement) {
                await containerRef.current.requestFullscreen();
                setIsFocusMode(true);
                setIsFullscreen(true);
                setIsSidebarOpen(false);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
                setIsFocusMode(false);
            }
        } catch (err) {
            const msg = err?.message || 'Fullscreen not available.';
            toast.error(msg);
        }
    };

    // Active Intel Loading
    useEffect(() => {
        if (selectedNode && activeTab === 'intel') {
            loadIntel(selectedNode.name);
        }
    }, [activeTab, selectedNode]);

    const loadIntel = async (conceptName) => {
        setIsLoadingIntel(true);
        try {
            const data = await ResourceService.scoutResources(conceptName);
            setActiveIntel(data); // Expects { analogy, insight, question }
        } catch (error) {
            const msg = error?.userMessage || error?.message || 'Failed to load concept intel.';
            setGraphError(msg);
            toast.error(msg);
        } finally {
            setIsLoadingIntel(false);
        }
    };

    const handleStartFocus = () => {
        if (!selectedNode) return;
        startSession({
            goal: `Mastering ${selectedNode.name}`,
            studyType: 'DEEP_WORK',
            duration: 25 * 60
        });
        navigate('/');
    };

    // Premium Node Rendering with LOD (Level of Detail)
    const paintNode = (node, ctx, globalScale) => {
        if (typeof node.x !== 'number' || typeof node.y !== 'number') return;

        const label = node.name || '...';
        const isSelected = selectedNode?.id === node.id;
        const isNeighbor = activeNeighbors.has(node.id);
        const isDimmed = selectedNode && !isSelected && !isNeighbor;

        const nodeVal = node.val || 12;

        // Color Logic - Cosmic Doodle Palette
        let coreColor = '#c2efb3'; // Mint base
        let glowColor = 'rgba(194, 239, 179, 0.45)';
        let strokeColor = 'rgba(220, 214, 247, 0.35)';

        if (node.status === 'COMPLETED') {
            coreColor = '#dcd6f7'; // Lavender
            glowColor = 'rgba(220, 214, 247, 0.55)';
            strokeColor = 'rgba(246, 242, 255, 0.9)';
        } else if (node.status === 'IN_PROGRESS') {
            coreColor = '#2ec4b6'; // Cosmic teal
            glowColor = 'rgba(46, 196, 182, 0.6)';
            strokeColor = 'rgba(246, 242, 255, 0.9)';
        } else if (node.status === 'UNLOCKED') {
            coreColor = '#c2efb3'; // Mint
            glowColor = 'rgba(194, 239, 179, 0.7)';
            strokeColor = 'rgba(246, 242, 255, 0.9)';
        } else if (node.is_merged) {
            coreColor = '#7fe3d2'; // Soft teal
            glowColor = 'rgba(127, 227, 210, 0.65)';
            strokeColor = 'rgba(246, 242, 255, 0.85)';
        } else {
            // LOCKED
            coreColor = '#6d687a'; // Ink gray
            glowColor = 'rgba(109, 104, 122, 0.25)';
            strokeColor = 'rgba(220, 214, 247, 0.2)';
        }

        // Draw Glow (only if not locked or if selected)
        if (node.status !== 'LOCKED' || isSelected) {
            const glowRadius = nodeVal * (isSelected ? 3 : 2.5);
            const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
            grad.addColorStop(0, glowColor);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Draw Core
        ctx.save();
        if (isSelected) {
            ctx.shadowBlur = 26;
            ctx.shadowColor = 'rgba(194, 239, 179, 0.65)';
        } else if (isNeighbor) {
            ctx.shadowBlur = 16;
            ctx.shadowColor = 'rgba(220, 214, 247, 0.45)';
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeVal / 2.5, 0, 2 * Math.PI); // Larger core
        ctx.fillStyle = isSelected ? '#fff' : coreColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3 / globalScale;

        // Dimming Logic - Softer
        ctx.globalAlpha = isDimmed ? 0.45 : 1;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1; // Reset

        // Level of Detail (LOD) - Avoid overlap
        // Only show labels for:
        // 1. Important statuses (Unlocked, Progress, Completed) at medium zoom
        // 2. Any node at very high zoom (to prevent clutter from Locked nodes)
        // 3. Selected node always
        const isImportant = node.status === 'UNLOCKED' || node.status === 'IN_PROGRESS' || node.status === 'COMPLETED' || node.is_merged;
        const shouldShowLabel =
            isSelected ||
            (globalScale > 0.6) || // Show labels much earlier
            isImportant; // Always show important ones if they exist

        if (shouldShowLabel) {
            const fontSize = 11 / globalScale;
            ctx.font = `${isSelected ? '900' : (isImportant ? '700' : 'normal')} ${fontSize}px "Bruno Ace", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const labelAlpha = isSelected ? 1 : (isImportant ? 0.9 : 0.4);
            ctx.fillStyle = `rgba(255, 255, 255, ${labelAlpha})`;

            // Background for label for better readability if important or selected
            if (isSelected || (globalScale > 2.5 && isImportant)) {
                const labelWidth = ctx.measureText(label).width;
                ctx.fillStyle = isSelected ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)';
                ctx.fillRect(node.x - labelWidth / 2 - 2, node.y + nodeVal / 2 + 4, labelWidth + 4, fontSize + 4);
            }

            ctx.fillStyle = isSelected ? '#fff' : `rgba(255, 255, 255, ${labelAlpha})`;
            ctx.fillText(label, node.x, node.y + nodeVal / 2 + 10);
        }

        // Sparkle ring for selected node
        if (isSelected) {
            const t = Date.now() * 0.002;
            const sparkleCount = 8;
            for (let i = 0; i < sparkleCount; i += 1) {
                const angle = t + (i * (Math.PI * 2)) / sparkleCount;
                const radius = nodeVal * 1.9 + (i % 3) * 2;
                const x = node.x + Math.cos(angle) * radius;
                const y = node.y + Math.sin(angle) * radius;
                ctx.beginPath();
                ctx.fillStyle = 'rgba(194, 239, 179, 0.9)';
                ctx.arc(x, y, 1.4 + (i % 2) * 0.6, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    };

    return (
        <div className="relative min-h-[calc(100vh-2rem)] overflow-hidden">
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(circle at 15% 10%, rgba(220,214,247,0.12), transparent 45%), radial-gradient(circle at 80% 18%, rgba(194,239,179,0.1), transparent 42%), radial-gradient(circle at 50% 80%, rgba(127,227,210,0.12), transparent 48%), linear-gradient(180deg, #0b0b0f 0%, #11121a 45%, #0d0f1a 100%)'
                }}
            />
            <div
                className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full blur-3xl opacity-60"
                style={{ background: 'radial-gradient(circle, rgba(220,214,247,0.2), transparent 70%)' }}
            />
            <div
                className="absolute -bottom-32 -left-20 w-[620px] h-[620px] rounded-full blur-3xl opacity-50"
                style={{ background: 'radial-gradient(circle, rgba(194,239,179,0.18), transparent 70%)' }}
            />
            <div
                className="absolute inset-0 opacity-30"
                style={{ background: 'radial-gradient(circle at 50% 50%, rgba(220,214,247,0.08), transparent 45%)' }}
            />

            <div className="min-h-[calc(100vh-2rem)] flex flex-col gap-5 animate-fade-in relative z-10 font-sans pb-3 px-2 md:px-6">
                {/* Header with Integrated Graph Controls */}
                {!isFocusMode && (
                    <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 pointer-events-auto pt-2">
                        <div className="relative group">
                            <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-slate-200 to-white flex items-center gap-3">
                                Knowledge Map
                            </h1>
                            <p className="text-sm text-slate-400 italic mt-2">Navigating your intellectual galaxy.</p>
                            <div className="absolute -bottom-1 left-0 w-0 h-1 bg-white/70 group-hover:w-full transition-all duration-500 shadow-[0_0_15px_rgba(220,214,247,0.4)]" />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-3 glass-morphism border-white/5 rounded-2xl px-4 py-2.5">
                                <Network className="w-4 h-4 text-white/70" />
                                <select
                                    className="bg-transparent text-sm text-white focus:outline-none w-52"
                                    value={selectedGraphId || ''}
                                    onChange={(e) => setSelectedGraphId(e.target.value)}
                                >
                                    <option value="" disabled className="text-dark-500">Select graph</option>
                                    {graphs.map((graph) => (
                                        <option key={graph.id} value={graph.id} className="bg-dark-900 text-white">
                                            {graph.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={selectedGraph ? () => openEditGraph(selectedGraph) : openCreateGraph}
                                    className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] border border-white/10 transition-all flex items-center gap-2"
                                >
                                    {selectedGraph ? (
                                        <>
                                            <SlidersHorizontal className="w-3.5 h-3.5" />
                                            Manage Graph
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-3.5 h-3.5" />
                                            New Graph
                                        </>
                                    )}
                                </button>
                            </div>

                            {selectedGraph && (
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/5 bg-dark-900/40 text-[10px] font-black uppercase tracking-widest text-white/70">
                                    <span className={`w-2 h-2 rounded-full ${selectedGraph.status === 'ready' ? 'bg-white' : selectedGraph.status === 'building' ? 'bg-white/60' : selectedGraph.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                                    {selectedGraph.status || 'draft'}
                                    <span className="text-white/30">·</span>
                                    {selectedGraph.node_count || 0} nodes
                                </div>
                            )}
                            {lastGraphRefreshAt && (
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/5 bg-dark-900/40 text-[10px] font-black uppercase tracking-widest text-white/50">
                                    Updated {lastGraphRefreshAt.toLocaleTimeString()}
                                </div>
                            )}

                              <div ref={viewMenuRef} className="relative">
                                  <button
                                      onClick={() => setShowViewMenu((prev) => !prev)}
                                      className="px-4 py-2.5 rounded-2xl glass-morphism border-white/5 text-white/80 text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                                  >
                                      Advanced
                                  </button>
                                <AnimatePresence>
                                    {showViewMenu && (
                                          <motion.div
                                              initial={{ opacity: 0, y: 6 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              exit={{ opacity: 0, y: 6 }}
                                              className="absolute right-0 mt-2 w-56 glass-dark border border-white/10 rounded-2xl overflow-hidden z-40"
                                          >
                                              <button
                                                  onClick={() => {
                                                      setShowConnections(true);
                                                      setShowViewMenu(false);
                                                  }}
                                                  className="w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-white/80 hover:bg-white/5 flex items-center gap-2"
                                                  disabled={!selectedGraphId}
                                              >
                                                  <Link2 className="w-4 h-4" />
                                                  Connections
                                              </button>
                                              <button
                                                  onClick={() => setShowCrossLinks(!showCrossLinks)}
                                                  className="w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-white/80 hover:bg-white/5 flex items-center gap-2"
                                              >
                                                <Link2 className="w-4 h-4" />
                                                Cross-Graph Links
                                                <span className="ml-auto text-[10px] text-white/50">{showCrossLinks ? 'On' : 'Off'}</span>
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Smart Search Container */}
                            <div className="relative w-72">
                                <div className={`flex items-center gap-3 px-4 py-2.5 glass-morphism border-white/5 rounded-2xl transition-all ${searchQuery ? 'border-white/30' : ''}`}>
                                    <Search className={`w-4 h-4 transition-colors ${searchQuery ? 'text-white' : 'text-dark-500'}`} />
                                    <input
                                        type="text"
                                        placeholder="Locate a neural node..."
                                        className="bg-transparent border-none text-sm text-white focus:outline-none w-full font-medium"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="text-dark-500 hover:text-white">
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                {/* Suggestions Dropdown */}
                                <AnimatePresence>
                                    {searchSuggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute top-full left-0 right-0 mt-2 glass-dark border border-white/5 rounded-2xl overflow-hidden z-50 shadow-2xl backdrop-blur-3xl"
                                        >
                                            {searchSuggestions.map((node) => (
                                                <button
                                                    key={node.id}
                                                    onClick={() => handleSelectSuggestion(node)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left text-sm transition-colors group"
                                                >
                                                    <div className={`w-2 h-2 rounded-full ${node.status === 'COMPLETED' ? 'bg-white/90' :
                                                        node.status === 'UNLOCKED' ? 'bg-white/70' : node.is_merged ? 'bg-white/50' : 'bg-slate-600'
                                                        } group-hover:scale-125 transition-transform`} />
                                                    <span className="text-white font-semibold flex-1">{node.name}</span>
                                                    <ChevronRight className="w-3 h-3 text-dark-600 group-hover:translate-x-1 transition-transform" />
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button
                                onClick={toggleFocusMode}
                                className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-xs font-black uppercase tracking-widest border border-white/10"
                                title="Fullscreen Focus Mode"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Maximize2 className="w-4 h-4" />
                                    Focus
                                </span>
                            </button>
                        </div>
                    </header>
                )}
                <InlineErrorBanner
                    message={
                        (selectedGraph && selectedGraph.status === 'error' && selectedGraph.error_message)
                            ? selectedGraph.error_message
                            : graphError
                    }
                    className="pointer-events-auto"
                />

                <div className="flex-1 flex gap-6 overflow-hidden relative">
                    {/* Construction HUD */}
                    {!isFocusMode && (
                        <AnimatePresence>
                            <ConstructionHUD documents={documents.filter(d => d.status === 'ingesting' || d.status === 'processing' || (d.ingestion_step || '').toLowerCase() === 'rate_limited' || d.ingestion_job_status === 'paused')} />
                        </AnimatePresence>
                    )}

                    {/* Main Viewport */}
                    <div ref={containerRef} className="flex-1 relative glass-dark rounded-[3rem] border border-white/5 overflow-hidden shadow-inner-white group">
                        <Starfield />

                        {/* Sidebar Toggle Button */}
                        {!isFocusMode && (
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className={`absolute top-1/2 -translate-y-1/2 right-4 z-30 p-2 glass-morphism rounded-full border border-white/10 text-white/80 hover:scale-110 transition-all ${isSidebarOpen ? '' : 'rotate-180'}`}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        )}

                        {!selectedGraphId ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-dark-950/20 backdrop-blur-md text-center p-10">
                                <Network className="w-12 h-12 text-white/80 mb-4" />
                                <h3 className="text-2xl font-black text-white mb-2">No Graph Selected</h3>
                                <p className="text-xs text-dark-400 max-w-md">
                                    Create a graph, choose processed documents, and build to generate the neural map.
                                    Large sources use model-safe defaults automatically.
                                </p>
                                <button
                                    onClick={openCreateGraph}
                                    className="mt-6 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest text-white border border-white/10"
                                >
                                    Create Graph
                                </button>
                            </div>
                        ) : isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-dark-950/20 backdrop-blur-md">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                    className="w-20 h-20 border-t-2 border-r-2 border-white/70 rounded-full"
                                />
                                <p className="mt-8 text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Synchronizing Synapses</p>
                            </div>
                        ) : (
                            <ForceGraph2D
                                ref={fgRef}
                                graphData={graphData}
                                nodeCanvasObject={paintNode}
                                onNodeClick={handleNodeFocus}
                                linkColor={(link) => {
                                    if (link?.relationship === 'cross_graph') return 'rgba(220, 214, 247, 0.5)';
                                    if (!selectedNode || !link) return 'rgba(220, 214, 247, 0.2)'; // Brighter default
                                    const sId = String(link.source?.id || link.source);
                                    const tId = String(link.target?.id || link.target);
                                    const nId = String(selectedNode.id);
                                    const isConnected = sId === nId || tId === nId;
                                    return isConnected ? 'rgba(194, 239, 179, 0.6)' : 'rgba(220, 214, 247, 0.08)';
                                }}
                                linkWidth={(link) => {
                                    if (link?.relationship === 'cross_graph') return 2.5;
                                    if (!selectedNode || !link) return 1.5; // Wider default
                                    const sId = String(link.source?.id || link.source);
                                    const tId = String(link.target?.id || link.target);
                                    const nId = String(selectedNode.id);
                                    const isConnected = sId === nId || tId === nId;
                                    return isConnected ? 3 : 1.0;
                                }}
                                linkDirectionalParticles={(link) => {
                                    if (!selectedNode || !link) return 0;
                                    const sId = String(link.source?.id || link.source);
                                    const tId = String(link.target?.id || link.target);
                                    const nId = String(selectedNode.id);
                                    return (sId === nId || tId === nId) ? 6 : 0;
                                }}
                                linkDirectionalParticleSpeed={selectedNode ? 0.014 : 0.003}
                                linkDirectionalParticleColor={(link) => {
                                    if (!selectedNode || !link) return 'rgba(220,214,247,0.2)';
                                    const sId = String(link.source?.id || link.source);
                                    const tId = String(link.target?.id || link.target);
                                    const nId = String(selectedNode.id);
                                    return (sId === nId || tId === nId) ? 'rgba(194, 239, 179, 0.9)' : 'rgba(220,214,247,0.08)';
                                }}
                                linkDirectionalParticleWidth={(link) => {
                                    if (!selectedNode || !link) return 1;
                                    const sId = String(link.source?.id || link.source);
                                    const tId = String(link.target?.id || link.target);
                                    const nId = String(selectedNode.id);
                                    return (sId === nId || tId === nId) ? 2 : 0;
                                }}
                                width={dimensions.width}
                                height={dimensions.height}
                                backgroundColor="transparent"
                                d3AlphaDecay={0.02}
                                d3VelocityDecay={0.3}
                                cooldownTicks={100}
                                onEngineStop={() => {
                                    // Final adjustment zoom if not already focused
                                    if (!selectedNode && fgRef.current) {
                                        fgRef.current.zoomToFit(400, 40);
                                    }
                                }}
                            />
                        )}

                        {selectedGraphId && !isLoading && graphData.nodes.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-dark-950/10 backdrop-blur-sm text-center p-10">
                                <h3 className="text-xl font-black text-white mb-2">Graph Empty</h3>
                                <p className="text-xs text-dark-400 max-w-md">
                                    Build the graph from existing document graphs or rebuild with LLM extraction.
                                </p>
                                <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
                                    Use Build in the header
                                </p>
                            </div>
                        )}

                        {/* Controls Overlay */}
                        {!isFocusMode && (
                            <div className="absolute bottom-10 left-10 flex gap-3 z-10 p-2 glass-morphism rounded-3xl border-white/10 border backdrop-blur-md">
                                {[
                                    { icon: Compass, label: 'Center', action: () => fgRef.current?.zoomToFit(1000) },
                                    { icon: HelpCircle, label: 'Guide', action: () => setShowGuide(true) }
                                ].map((btn) => (
                                    <button
                                        key={btn.label}
                                        onClick={(e) => { e.stopPropagation(); btn.action(); }}
                                        className="p-3 text-white/50 hover:text-white hover:bg-white/5 rounded-2xl transition-all group relative"
                                    >
                                        <btn.icon className="w-5 h-5" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-dark-900 border border-white/10 rounded text-[9px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {btn.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Integrated Legend Pill */}
                        {!isFocusMode && (
                            <div className="absolute top-6 right-6 flex items-center gap-3 z-30 p-2 glass-morphism rounded-2xl border-white/5 opacity-40 hover:opacity-100 transition-opacity pointer-events-auto">
                                {[
                                    { color: 'bg-white', label: 'Frontier' },
                                    { color: 'bg-white/70', label: 'Masteries' },
                                    { color: 'bg-white/40', label: 'Linked' },
                                    { color: 'bg-slate-700', label: 'Locked' }
                                ].map(item => (
                                    <div key={item.label} className="flex items-center gap-2 px-2 border-r border-white/5 last:border-0 cursor-help group/pill">
                                        <div className={`w-1.5 h-1.5 rounded-full ${item.color} shadow-[0_0_8px_rgba(220,214,247,0.2)]`} />
                                        <span className="text-[10px] font-black text-white/60 uppercase tracking-tighter">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isFocusMode && (
                            <button
                                onClick={toggleFocusMode}
                                className="absolute top-5 right-5 z-40 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest border border-white/10"
                            >
                                Exit Focus
                            </button>
                        )}

                    </div>

                    {/* Sidebar Panel */}
                    <AnimatePresence>
                        {isSidebarOpen && !isFocusMode && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: "20rem", opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="flex flex-col gap-6 overflow-hidden"
                            >
                                <AnimatePresence mode="wait">
                                    {selectedNode ? (
                                        <motion.div
                                            key={selectedNode.id}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            className="h-full flex flex-col"
                                        >
                                            <Card className="flex-1 flex flex-col bg-dark-950/40 border-white/5 backdrop-blur-2xl rounded-[3rem] p-0 overflow-hidden">
                                                {/* Header Splash */}
                                                <div className={`h-1.5 w-full ${selectedNode.status === 'COMPLETED' ? 'bg-white' :
                                                    selectedNode.status === 'UNLOCKED' ? 'bg-white/70' : 'bg-slate-700'
                                                    }`} />

                                                <div className="p-8 flex flex-col h-full">
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/80 flex items-center gap-2">
                                                            <Target className="w-3 h-3" />
                                                            Active Focus
                                                        </div>
                                                        <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-white/5 rounded-xl text-dark-500">
                                                            <X className="w-5 h-5" />
                                                        </button>
                                                    </div>

                                                    <h2 className="text-3xl font-black text-white tracking-tight mb-4 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                                        {selectedNode.name}
                                                    </h2>

                                                    {/* Navigation Tabs */}
                                                    <div className="flex gap-1 p-1 bg-dark-900/50 rounded-2xl mb-8 border border-white/5">
                                                        <button
                                                            onClick={() => setActiveTab('overview')}
                                                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'overview' ? 'bg-white/10 text-white shadow-lg' : 'text-dark-500 hover:text-white'}`}
                                                        >
                                                            Intelligence
                                                        </button>
                                                        <button
                                                            onClick={() => setActiveTab('intel')}
                                                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'intel' ? 'bg-white/10 text-white shadow-lg' : 'text-dark-500 hover:text-white'}`}
                                                        >
                                                            Active Intel
                                                        </button>
                                                    </div>

                                                    {/* Content Viewport */}
                                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                                                        {activeTab === 'overview' ? (
                                                            <div className="space-y-8">
                                                                <div>
                                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-dark-600 mb-2 flex items-center gap-2">
                                                                        <Compass className="w-3 h-3" /> Philosophical Overview
                                                                    </h4>
                                                                    <p className="text-sm text-dark-300 leading-relaxed font-medium">
                                                                        {selectedNode.description || 'This concept represents a pivotal junction in the neural lattice. Mastering it will unlock pathwards to more complex domains.'}
                                                                    </p>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <button
                                                                        onClick={handleStartFocus}
                                                                        className="flex flex-col items-center justify-center p-6 glass-morphism border-white/5 rounded-[2rem] hover:border-white/40 transition-all group"
                                                                    >
                                                                        <Timer className="w-6 h-6 text-white mb-2 group-hover:scale-110 transition-transform" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Deep Focus</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => navigate('/practice', { state: { searchTarget: selectedNode.name } })}
                                                                        className="flex flex-col items-center justify-center p-6 glass-morphism border-white/5 rounded-[2rem] hover:border-white/40 transition-all group"
                                                                    >
                                                                        <Zap className="w-6 h-6 text-white mb-2 group-hover:scale-110 transition-transform" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Neural Stress</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-6">
                                                                {isLoadingIntel ? (
                                                                    <div className="py-20 flex flex-col items-center justify-center opacity-50">
                                                                        <Sparkles className="w-10 h-10 text-white/80 animate-pulse mb-4" />
                                                                        <p className="text-[9px] font-black uppercase tracking-widest">Generating Active Intel</p>
                                                                    </div>
                                                                ) : activeIntel ? (
                                                                    <div className="space-y-4 animate-fade-in">
                                                                        {/* Insight Card */}
                                                                        <div className="p-5 bg-gradient-to-br from-white/10 to-transparent rounded-3xl border border-white/10">
                                                                            <div className="flex items-center gap-2 mb-3">
                                                                                <Sparkles className="w-4 h-4 text-white/80" />
                                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/80">Key Insight</h4>
                                                                            </div>
                                                                            <p className="text-white text-sm font-medium leading-relaxed">
                                                                                "{activeIntel.insight}"
                                                                            </p>
                                                                        </div>

                                                                        {/* Analogy Card */}
                                                                        <div className="p-5 bg-gradient-to-br from-white/10 to-transparent rounded-3xl border border-white/10">
                                                                            <div className="flex items-center gap-2 mb-3">
                                                                                <Compass className="w-4 h-4 text-white/80" />
                                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/80">Mental Model</h4>
                                                                            </div>
                                                                            <p className="text-white text-sm font-medium leading-relaxed italic">
                                                                                {activeIntel.analogy}
                                                                            </p>
                                                                        </div>

                                                                        {/* Socratic Question */}
                                                                        <div className="p-5 bg-gradient-to-br from-white/10 to-transparent rounded-3xl border border-white/10">
                                                                            <div className="flex items-center gap-2 mb-3">
                                                                                <HelpCircle className="w-4 h-4 text-white/80" />
                                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/80">Challenge</h4>
                                                                            </div>
                                                                            <p className="text-white text-sm font-bold leading-relaxed">
                                                                                {activeIntel.question}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center py-10 opacity-50 text-xs">
                                                                        No intel available for this node.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Card>
                                        </motion.div>
                                    ) : (
                                        <div className="h-full glass-dark rounded-[3rem] border border-dashed border-white/10 flex flex-col items-center justify-center p-8 text-center group">
                                            <div className="w-20 h-20 bg-dark-900 border border-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-all duration-500 shadow-xl group-hover:shadow-white/20">
                                                <Network className="w-8 h-8 text-dark-600 group-hover:text-white/80 transition-colors" />
                                            </div>
                                            <h4 className="text-white text-[10px] font-black uppercase tracking-[0.2em] mb-3">Select Node</h4>
                                            <p className="text-[10px] text-dark-500 leading-relaxed font-medium max-w-[180px] mb-8">
                                                Intercept a neural packet from the tree to examine properties.
                                            </p>

                                            {/* Integrated Legend */}
                                            <div className="flex flex-col gap-3 w-full max-w-[160px]">
                                                {[
                                                    { color: 'bg-white', label: 'Frontier', desc: 'Unlocked Concepts' },
                                                    { color: 'bg-white/70', label: 'Mastered', desc: 'Core Stability' },
                                                    { color: 'bg-slate-700', label: 'Locked', desc: 'Hidden Nodes' }
                                                ].map(item => (
                                                    <div key={item.label} className="flex items-center gap-3 p-2 bg-white/5 rounded-xl border border-white/5">
                                                        <div className={`w-2 h-2 rounded-full ${item.color} shadow-[0_0_8px_rgba(220,214,247,0.2)]`} />
                                                        <div className="text-left">
                                                            <p className="text-[9px] font-black text-white uppercase tracking-tighter leading-none">{item.label}</p>
                                                            <p className="text-[8px] text-dark-500 font-medium leading-none mt-1">{item.desc}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Graph Create/Edit Modal */}
                <AnimatePresence>
                    {showGraphModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-dark-950/90 backdrop-blur-3xl"
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
                                className="w-full max-w-3xl glass-morphism p-10 rounded-[3rem] relative border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                            >
                                <button onClick={() => setShowGraphModal(false)} className="absolute top-8 right-8 text-dark-400 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                                <h3 className="text-3xl font-black text-white mb-6 tracking-tighter">
                                    {editingGraph ? 'Edit Graph' : 'Create Graph'}
                                </h3>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Graph Name</label>
                                        <input
                                            className="w-full px-4 py-3 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-white/40"
                                            value={graphForm.name}
                                            onChange={(e) => setGraphForm({ ...graphForm, name: e.target.value })}
                                            placeholder="e.g. Biology Core"
                                        />
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Description</label>
                                        <textarea
                                            rows={3}
                                            className="w-full px-4 py-3 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-white/40"
                                            value={graphForm.description}
                                            onChange={(e) => setGraphForm({ ...graphForm, description: e.target.value })}
                                            placeholder="Purpose and focus of this graph"
                                        />
                                        <div className="pt-2">
                                            <div className="rounded-2xl border border-white/5 bg-dark-900/50 p-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-dark-500">LLM Source</p>
                                                        <p className="text-[9px] text-dark-600 leading-tight mt-1">
                                                            {kgLlmConfig.source === 'override' ? 'Using Knowledge Map override' : 'Using global LLM settings'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right text-[10px] text-white/80">
                                                        <div>{kgLlmConfig.provider || 'Not set'}</div>
                                                        <div className="text-white/40">{kgLlmConfig.model || 'Model not set'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-2">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <div className="flex flex-col">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Context Strength</label>
                                                        <span className="text-[9px] text-dark-600 leading-tight">Determines how much surrounding text the AI "sees" to find connections.</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="w-full px-4 py-2 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-primary-500/50"
                                                        value={graphForm.extraction_max_chars || 4000}
                                                        onChange={(e) => setGraphForm({ ...graphForm, extraction_max_chars: parseInt(e.target.value) })}
                                                        placeholder="4000"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex flex-col">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Detail Density</label>
                                                        <span className="text-[9px] text-dark-600 leading-tight">Size of individual info blocks. Smaller blocks = finer detail.</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="w-full px-4 py-2 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-primary-500/50"
                                                        value={graphForm.chunk_size || 1500}
                                                        onChange={(e) => setGraphForm({ ...graphForm, chunk_size: parseInt(e.target.value) })}
                                                        placeholder="1500"
                                                    />
                                                </div>
                                            </div>
                                            {recommendedSettings && (
                                                <div className="mt-4 rounded-2xl border border-white/10 bg-dark-900/60 p-4 text-[11px] text-white/70">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                                                            Recommended for {recommendedSettings.model}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setGraphForm({
                                                                ...graphForm,
                                                                extraction_max_chars: recommendedSettings.recommendedExtractionMaxChars,
                                                                chunk_size: recommendedSettings.recommendedChunkSize
                                                            })}
                                                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest text-white/80"
                                                        >
                                                            Use Recommended
                                                        </button>
                                                    </div>
                                                    <div className="mt-2">
                                                        Extraction window: {recommendedSettings.recommendedExtractionMaxChars} chars · Chunk size: {recommendedSettings.recommendedChunkSize}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Documents</label>
                                        <div className="mt-3 max-h-72 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                                            {documents.length === 0 && (
                                                <div className="text-xs text-dark-500 py-4">No documents found.</div>
                                            )}
                                            {documents.map((doc) => {
                                                const phase = (doc.ingestion_step || '').toLowerCase();
                                                const jobStatus = doc.ingestion_job_status;
                                                const jobMessage = doc.ingestion_job_message || '';
                                                const isRateLimited = phase === 'rate_limited'
                                                    || jobStatus === 'paused'
                                                    || jobMessage.toLowerCase().includes('rate limit');
                                                return (
                                                    <button
                                                        key={doc.id}
                                                        onClick={() => toggleDocumentSelection(doc.id)}
                                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${graphForm.document_ids.includes(doc.id) ? 'border-white/40 bg-white/10' : 'border-white/5 bg-dark-900/40 hover:bg-white/5'}`}
                                                    >
                                                        <div className="text-left">
                                                            <div className="text-sm text-white font-semibold">{doc.title || doc.filename}</div>
                                                            <div className="text-[10px] text-dark-400">
                                                                {doc.status}
                                                                {isRateLimited && (
                                                                    <span className="ml-2 text-[9px] px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-200 border border-primary-500/30">
                                                                        Paused (rate limited)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className={`w-3 h-3 rounded-full ${graphForm.document_ids.includes(doc.id) ? 'bg-white' : 'bg-dark-700'}`} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {recommendedSettings && (
                                            <div className="mt-3 text-[10px] text-dark-500">
                                                Large sources will use model-safe defaults ({recommendedSettings.recommendedExtractionMaxChars} chars, chunk {recommendedSettings.recommendedChunkSize}).
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8 pt-8 border-t border-white/5 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Assembly Method</label>
                                                <span className="text-[9px] text-dark-600 leading-tight">Controls how new documents are integrated into the graph.</span>
                                            </div>
                                            <div className="flex gap-2">
                                                {[
                                                    { id: 'existing', label: 'Smart Update', desc: 'Adds new docs while preserving existing data. Best for growing your map.' },
                                                    { id: 'rebuild', label: 'Total Reset', desc: 'Re-scans everything to build a fresh, optimized graph.' }
                                                ].map(mode => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setBuildMode(mode.id)}
                                                        className={`flex-1 flex flex-col p-4 rounded-2xl border transition-all text-left ${buildMode === mode.id ? 'border-white/40 bg-white/10' : 'border-white/5 bg-dark-900/40 hover:bg-white/5'}`}
                                                    >
                                                        <span className="text-xs font-black text-white uppercase tracking-tighter">{mode.label}</span>
                                                        <span className="text-[8px] text-dark-500 leading-tight mt-1">{mode.desc}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Extraction Style</label>
                                                <span className="text-[9px] text-dark-600 leading-tight">Sets the density and focus of information extracted.</span>
                                            </div>
                                            <div className="flex gap-2">
                                                {[
                                                    { id: 'filtered', label: 'Focused', desc: 'Synthesizes key concepts for clear maps.' },
                                                    { id: 'raw', label: 'Comprehensive', desc: 'Extracts every detail for exhaustive links.' }
                                                ].map(mode => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setBuildSourceMode(mode.id)}
                                                        className={`flex-1 p-3 rounded-2xl border transition-all text-center ${buildSourceMode === mode.id ? 'bg-white/10 text-white border-white/40' : 'bg-dark-900/40 text-dark-500 border-white/5 hover:bg-white/5'}`}
                                                    >
                                                        <div className="text-[10px] font-black uppercase tracking-widest">{mode.label}</div>
                                                        <div className="text-[8px] mt-0.5 opacity-60 lowercase">{mode.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {isGraphLoading && (
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 animate-pulse">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Neural Assembly Underway</span>
                                                <span className="text-white font-black text-[10px]">{Math.round(selectedGraph?.build_progress || 0)}%</span>
                                            </div>
                                            <div className="h-1 w-full bg-dark-900 rounded-full overflow-hidden">
                                                <div className="h-full bg-white transition-all duration-500" style={{ width: `${selectedGraph?.build_progress || 0}%` }} />
                                            </div>
                                        </div>
                                    )}

                                    <InlineErrorBanner message={buildError} />
                                </div>

                                <div className="flex justify-between items-center mt-10">
                                    {editingGraph && (
                                        <button
                                            onClick={async () => {
                                                if (window.confirm('Erase this knowledge map forever?')) {
                                                    await GraphService.deleteGraph(editingGraph.id);
                                                    setShowGraphModal(false);
                                                    setSelectedGraphId(null);
                                                    loadGraphs();
                                                    toast.success('Graph erased.');
                                                }
                                            }}
                                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500/60 hover:text-rose-500 transition-colors"
                                        >
                                            Delete Graph
                                        </button>
                                    )}
                                    <div className="flex gap-3 ml-auto">
                                        <button onClick={() => setShowGraphModal(false)} className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-dark-400 hover:text-white transition-all">
                                            Close
                                        </button>
                                        <button onClick={handleSaveGraph} className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 border border-white/5 transition-all">
                                            Save Only
                                        </button>
                                        <button
                                            onClick={handleSaveAndBuild}
                                            disabled={isGraphLoading}
                                            className="px-8 py-3 rounded-2xl bg-white text-dark-950 text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            {isGraphLoading ? 'Building...' : 'Save & Build Graph'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>


                {/* Connections Modal */}
                <AnimatePresence>
                    {showConnections && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-dark-950/90 backdrop-blur-3xl"
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
                                className="w-full max-w-4xl glass-morphism p-10 rounded-[3rem] relative border border-white/10 shadow-2xl"
                            >
                                <button onClick={() => setShowConnections(false)} className="absolute top-8 right-8 text-dark-400 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                                <h3 className="text-2xl font-black text-white mb-6 tracking-tighter">Cross-Graph Connections</h3>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Target Graph</label>
                                        <select
                                            className="w-full px-4 py-3 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none"
                                            value={targetGraphId}
                                            onChange={(e) => setTargetGraphId(e.target.value)}
                                        >
                                            <option value="" disabled className="text-dark-500">Select target graph</option>
                                            {graphs.filter(g => g.id !== selectedGraphId).map((graph) => (
                                                <option key={graph.id} value={graph.id} className="bg-dark-900 text-white">
                                                    {graph.name}
                                                </option>
                                            ))}
                                        </select>
                                        {graphs.filter(g => g.id !== selectedGraphId).length === 0 && (
                                            <div className="text-[10px] text-dark-500">Create another graph to connect.</div>
                                        )}
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Context</label>
                                        <textarea
                                            rows={4}
                                            className="w-full px-4 py-3 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none"
                                            value={connectionContext}
                                            onChange={(e) => setConnectionContext(e.target.value)}
                                            placeholder="Describe the context for linking these graphs"
                                        />
                                        <button
                                            onClick={handleSuggestConnections}
                                            className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest text-white border border-white/10"
                                            disabled={!targetGraphId || !connectionContext.trim() || isSuggesting}
                                        >
                                            {isSuggesting ? 'Analyzing...' : 'Suggest Connections'}
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Suggestions</label>
                                        <div className="mt-3 max-h-72 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                                            {connectionSuggestions.length === 0 && (
                                                <div className="text-xs text-dark-500 py-4">No suggestions yet.</div>
                                            )}
                                            {connectionSuggestions.map((conn, idx) => (
                                                <div key={`${conn.from_scoped_id}-${conn.to_scoped_id}-${idx}`} className="p-3 rounded-2xl border border-white/5 bg-dark-900/50 flex items-start gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedConnections.has(idx)}
                                                        onChange={() => {
                                                            const next = new Set(selectedConnections);
                                                            if (next.has(idx)) next.delete(idx);
                                                            else next.add(idx);
                                                            setSelectedConnections(next);
                                                        }}
                                                    />
                                                    <div>
                                                        <div className="text-xs text-white font-semibold">
                                                            {conn.from_scoped_id} → {conn.to_scoped_id}
                                                        </div>
                                                        <div className="text-[10px] text-dark-400">{conn.rationale || 'Suggested link'}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {connectionSuggestions.length > 0 && (
                                            <div className="flex justify-end mt-4">
                                                <button
                                                    onClick={handleSaveConnections}
                                                    className="px-5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-widest text-white border border-white/10"
                                                >
                                                    Save Connections
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Premium Guide Modal */}
                <AnimatePresence>
                    {showGuide && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-dark-950/90 backdrop-blur-3xl"
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
                                className="max-w-xl w-full glass-morphism p-10 rounded-[3rem] relative border border-white/10 shadow-2xl overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-8">
                                    <button
                                        onClick={() => {
                                            setShowGuide(false);
                                            setGuideDismissed(true);
                                            if (typeof window !== 'undefined') {
                                                localStorage.setItem('kgGuideDismissed', '1');
                                            }
                                        }}
                                        className="text-dark-400 hover:text-white transition-colors"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <h3 className="text-3xl font-black text-white mb-8 tracking-tighter">Tree Navigation</h3>

                                <div className="space-y-8">
                                    <div className="flex gap-6 items-start">
                                        <div className="w-12 h-12 rounded-3xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                                            <Sparkles className="w-6 h-6 text-white/80" />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-2">The Frontier</h4>
                                            <p className="text-xs text-dark-400 leading-relaxed">These are concepts you have unlocked. They are the next step in your cognitive evolution.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-6 items-start">
                                        <div className="w-12 h-12 rounded-3xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                                            <CheckCircle2 className="w-6 h-6 text-white/80" />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-2">Stability</h4>
                                            <p className="text-xs text-dark-400 leading-relaxed">Concepts you have already mastered. They form your intellectual core.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-6 items-start">
                                        <div className="w-12 h-12 rounded-3xl bg-slate-700/20 flex items-center justify-center shrink-0 border border-slate-700/30">
                                            <Lock className="w-6 h-6 text-slate-500" />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-2">Occlusion (Slate)</h4>
                                            <p className="text-xs text-dark-400 leading-relaxed">Advanced domains that require masteries of preceding neural nodes.</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setShowGuide(false);
                                        setGuideDismissed(true);
                                        if (typeof window !== 'undefined') {
                                            localStorage.setItem('kgGuideDismissed', '1');
                                        }
                                    }}
                                    className="w-full mt-12 py-4 font-black text-xs uppercase tracking-[0.3em] rounded-3xl bg-white/10 hover:bg-white/20 text-white border border-white/10"
                                >
                                    Proceed to Nexus
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default KnowledgeGraph;
