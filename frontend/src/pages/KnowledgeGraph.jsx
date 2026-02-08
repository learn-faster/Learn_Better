import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import {
    Network,
    RefreshCw,
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
            {documents.map(doc => (
                <div key={doc.id} className="p-4 glass-morphism rounded-2xl border border-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.1)] backdrop-blur-md relative overflow-hidden">
                    {/* Scanline Effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/5 to-transparent animate-scan" />

                    <div className="flex justify-between items-start mb-2 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Neural Construction</span>
                        </div>
                        <span className="text-[10px] font-bold text-amber-500/70">{doc.ingestion_progress || 0}%</span>
                    </div>

                    <h4 className="text-sm font-bold text-white mb-1 truncate relative z-10">{doc.title}</h4>
                    <p className="text-[10px] text-amber-200/60 font-mono mb-3 relative z-10">
                        {doc.ingestion_step ? `> ${doc.ingestion_step}` : '> INITIALIZING UPLINK...'}
                    </p>

                    <div className="h-1 bg-dark-900/50 rounded-full overflow-hidden relative z-10">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${doc.ingestion_progress || 5}%` }}
                            transition={{ ease: "linear" }}
                            className="h-full bg-amber-500/80 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                        />
                    </div>
                </div>
            ))}
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
    const [isSyncing, setIsSyncing] = useState(false);
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
        llm_config: { provider: 'openai', model: '', base_url: '' }
    });
    const [buildMode, setBuildMode] = useState('existing');
    const [buildSourceMode, setBuildSourceMode] = useState('filtered');
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
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    const [activeNeighbors, setActiveNeighbors] = useState(new Set());
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Concept Tutor State (Active Intel)
    const [activeIntel, setActiveIntel] = useState(null);
    const [isLoadingIntel, setIsLoadingIntel] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    const fgRef = useRef();
    const containerRef = useRef();
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

    const loadGraphs = async () => {
        try {
            const data = await GraphService.listGraphs('default_user');
            setGraphs(data || []);
            if (!selectedGraphId && data && data.length > 0) {
                setSelectedGraphId(data[0].id);
            }
        } catch (error) {
            console.error("Failed to load graphs", error);
        }
    };

    const openCreateGraph = () => {
        setEditingGraph(null);
        setGraphForm({
            name: '',
            description: '',
            document_ids: [],
            llm_config: { provider: 'openai', model: '', base_url: '' }
        });
        setShowGraphModal(true);
    };

    const openEditGraph = (graph) => {
        setEditingGraph(graph);
        setGraphForm({
            name: graph.name || '',
            description: graph.description || '',
            document_ids: graph.document_ids || [],
            llm_config: graph.llm_config || { provider: 'openai', model: '', base_url: '' }
        });
        setShowGraphModal(true);
    };

    const handleSaveGraph = async () => {
        try {
            const payload = {
                name: graphForm.name,
                description: graphForm.description,
                document_ids: graphForm.document_ids,
                llm_config: graphForm.llm_config
            };
            let saved;
            if (editingGraph) {
                saved = await GraphService.updateGraph(editingGraph.id, payload);
            } else {
                saved = await GraphService.createGraph({ ...payload, user_id: 'default_user' });
            }
            await loadGraphs();
            setSelectedGraphId(saved.id);
            setShowGraphModal(false);
        } catch (error) {
            console.error("Failed to save graph", error);
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
            await GraphService.buildGraph(selectedGraphId, { build_mode: buildMode, source_mode: buildSourceMode });
            await fetchGraph(true);
            await loadGraphs();
            setShowBuildModal(false);
        } catch (error) {
            setBuildError(error || 'Failed to build graph');
        } finally {
            setIsGraphLoading(false);
        }
    };

    const fetchGraph = async (showSyncEffect = false) => {
        if (!selectedGraphId) return;
        if (showSyncEffect) setIsSyncing(true);
        else if (graphData.nodes.length === 0) setIsLoading(true);

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

            if (graphData.nodes.length === 0) {
                setTimeout(() => {
                    if (fgRef.current) {
                        fgRef.current.zoomToFit(800, 50);
                    }
                }, 600);
            }

            if (data.nodes.length === 0 && !showSyncEffect) setShowGuide(true);
        } catch (error) {
            console.error("Failed to fetch graph", error);
            if (graphData.nodes.length === 0) setGraphData({ nodes: [], links: [] });
        } finally {
            setIsLoading(false);
            if (showSyncEffect) setTimeout(() => setIsSyncing(false), 1000);
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
            console.error("Failed to suggest connections", error);
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
            console.error("Failed to save connections", error);
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
        const checkStatus = async () => {
            await fetchDocuments();
            // Check if any doc is ingesting
            const isIngesting = documents.some(d => d.status === 'ingesting' || d.status === 'processing');
            if (isIngesting) {
                // If ingesting, fetch graph incrementally to show partial updates!
                fetchGraph(false);
            }
        };

        // Poll more frequently if something is happening
        const hasActiveJobs = documents.some(d => d.status === 'ingesting');
        if (hasActiveJobs) {
            interval = setInterval(checkStatus, 2000);
        } else {
            // Just periodic check or rely on initial load
            checkStatus(); // Load once
            interval = setInterval(checkStatus, 10000);
        }

        return () => clearInterval(interval);
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
            console.error("Failed to load intel", error);
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

        // Color Logic - Bright Premium Palette
        let coreColor = '#475569'; // Slate-600 base
        let glowColor = 'rgba(255, 255, 255, 0)';
        let strokeColor = 'rgba(255, 255, 255, 0.2)';

        if (node.status === 'COMPLETED') {
            coreColor = '#fbbf24'; // Amber-400
            glowColor = 'rgba(251, 191, 36, 0.5)';
            strokeColor = '#fff';
        } else if (node.status === 'IN_PROGRESS') {
            coreColor = '#fb923c'; // Orange-400
            glowColor = 'rgba(251, 146, 60, 0.5)';
            strokeColor = '#fff';
        } else if (node.status === 'UNLOCKED') {
            coreColor = '#22d3ee'; // Cyan-400
            glowColor = 'rgba(34, 211, 238, 0.6)';
            strokeColor = '#fff';
        } else if (node.is_merged) {
            coreColor = '#a855f7'; // Purple-500
            glowColor = 'rgba(168, 85, 247, 0.5)';
            strokeColor = '#fff';
        } else {
            // LOCKED - Brighter than before
            coreColor = '#64748b'; // Slate-500
            glowColor = 'rgba(100, 116, 139, 0.2)';
            strokeColor = 'rgba(255, 255, 255, 0.15)';
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
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeVal / 2.5, 0, 2 * Math.PI); // Larger core
        ctx.fillStyle = isSelected ? '#fff' : coreColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3 / globalScale;

        // Dimming Logic - Softer
        ctx.globalAlpha = isDimmed ? 0.45 : 1;
        ctx.fill();
        ctx.stroke();
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
            ctx.font = `${isSelected ? '900' : (isImportant ? '700' : 'normal')} ${fontSize}px Outfit, sans-serif`;
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
    };

    return (
        <div className="min-h-[calc(100vh-2rem)] flex flex-col gap-5 animate-fade-in relative z-10 font-sans pb-3">
            {/* Header with Integrated Graph Controls */}
            <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 pointer-events-auto">
                <div className="relative group">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-cyan-400 to-primary-600 flex items-center gap-3">
                        Neural Tree
                    </h1>
                    <div className="absolute -bottom-1 left-0 w-0 h-1 bg-cyan-500 group-hover:w-full transition-all duration-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-3 glass-morphism border-white/5 rounded-2xl px-4 py-2.5">
                        <Network className="w-4 h-4 text-cyan-400" />
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
                        <button onClick={openCreateGraph} className="p-1.5 rounded-lg hover:bg-white/5 text-cyan-300">
                            <Plus className="w-4 h-4" />
                        </button>
                        {selectedGraph && (
                            <button onClick={() => openEditGraph(selectedGraph)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/70">
                                <SlidersHorizontal className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {selectedGraph && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/5 bg-dark-900/40 text-[10px] font-black uppercase tracking-widest text-white/70">
                            <span className={`w-2 h-2 rounded-full ${selectedGraph.status === 'ready' ? 'bg-cyan-400' : selectedGraph.status === 'building' ? 'bg-amber-400' : selectedGraph.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                            {selectedGraph.status || 'draft'}
                            <span className="text-white/30">·</span>
                            {selectedGraph.node_count || 0} nodes
                        </div>
                    )}

                    <button
                        onClick={() => setShowBuildModal(true)}
                        className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-primary-600/80 to-cyan-500/80 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all"
                        disabled={!selectedGraphId}
                    >
                        Build Graph
                    </button>

                    <button
                        onClick={() => setShowConnections(true)}
                        className="px-4 py-2.5 rounded-2xl glass-morphism border-white/5 text-cyan-200 text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                        disabled={!selectedGraphId}
                    >
                        Connections
                    </button>

                    <button
                        onClick={() => setShowCrossLinks(!showCrossLinks)}
                        className={`px-3 py-2.5 rounded-2xl border border-white/5 text-xs font-black uppercase tracking-widest transition-all ${showCrossLinks ? 'bg-purple-500/20 text-purple-200' : 'bg-dark-900/40 text-white/50 hover:bg-white/5'}`}
                        title="Toggle cross-graph links"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Link2 className="w-4 h-4" />
                            Links
                        </span>
                    </button>

                    {/* Smart Search Container */}
                    <div className="relative w-72">
                        <div className={`flex items-center gap-3 px-4 py-2.5 glass-morphism border-white/5 rounded-2xl transition-all ${searchQuery ? 'border-cyan-500/30' : ''}`}>
                            <Search className={`w-4 h-4 transition-colors ${searchQuery ? 'text-cyan-400' : 'text-dark-500'}`} />
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
                                            <div className={`w-2 h-2 rounded-full ${node.status === 'COMPLETED' ? 'bg-amber-400' :
                                                node.status === 'UNLOCKED' ? 'bg-cyan-400' : node.is_merged ? 'bg-purple-400' : 'bg-slate-600'
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
                        onClick={() => fetchGraph(true)}
                        className="p-2.5 glass-morphism border-white/5 rounded-2xl text-cyan-400 hover:bg-cyan-500/10 transition-all shadow-lg active:scale-95"
                        title="Sync Data"
                    >
                        <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            <div className="flex-1 flex gap-6 overflow-hidden relative">
                {/* Construction HUD */}
                <AnimatePresence>
                    <ConstructionHUD documents={documents.filter(d => d.status === 'ingesting')} />
                </AnimatePresence>

                {/* Main Viewport */}
                <div ref={containerRef} className="flex-1 relative glass-dark rounded-[3rem] border border-white/5 overflow-hidden shadow-inner-white group">
                    <Starfield />

                    {/* Sidebar Toggle Button */}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`absolute top-1/2 -translate-y-1/2 right-4 z-30 p-2 glass-morphism rounded-full border border-white/10 text-cyan-400 hover:scale-110 transition-all ${isSidebarOpen ? '' : 'rotate-180'}`}
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>

                    {!selectedGraphId ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-dark-950/20 backdrop-blur-md text-center p-10">
                            <Network className="w-12 h-12 text-cyan-400 mb-4" />
                            <h3 className="text-2xl font-black text-white mb-2">No Graph Selected</h3>
                            <p className="text-xs text-dark-400 max-w-md">
                                Create a graph, choose documents, and build to generate the neural map.
                            </p>
                            <button
                                onClick={openCreateGraph}
                                className="mt-6 px-5 py-3 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-xs font-black uppercase tracking-widest text-white"
                            >
                                Create Graph
                            </button>
                        </div>
                    ) : isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-dark-950/20 backdrop-blur-md">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="w-20 h-20 border-t-2 border-r-2 border-cyan-500 rounded-full"
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
                                if (link?.relationship === 'cross_graph') return 'rgba(168, 85, 247, 0.5)';
                                if (!selectedNode || !link) return 'rgba(255, 255, 255, 0.15)'; // Brighter default
                                const sId = String(link.source?.id || link.source);
                                const tId = String(link.target?.id || link.target);
                                const nId = String(selectedNode.id);
                                const isConnected = sId === nId || tId === nId;
                                return isConnected ? 'rgba(6, 182, 212, 0.6)' : 'rgba(255, 255, 255, 0.05)';
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
                            linkDirectionalParticles={selectedNode ? 4 : 1}
                            linkDirectionalParticleSpeed={selectedNode ? 0.01 : 0.003}
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
                            <button
                                onClick={() => setShowBuildModal(true)}
                                className="mt-6 px-5 py-3 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-xs font-black uppercase tracking-widest text-white"
                            >
                                Build Now
                            </button>
                        </div>
                    )}

                    {/* Controls Overlay */}
                    <div className="absolute bottom-10 left-10 flex gap-3 z-10 p-2 glass-morphism rounded-3xl border-white/10 border backdrop-blur-md">
                        {[
                            { icon: Compass, label: 'Center', action: () => fgRef.current?.zoomToFit(1000) },
                            { icon: Maximize2, label: 'Sidebar', action: () => setIsSidebarOpen(!isSidebarOpen) },
                            { icon: HelpCircle, label: 'Guide', action: () => setShowGuide(true) }
                        ].map((btn) => (
                            <button
                                key={btn.label}
                                onClick={(e) => { e.stopPropagation(); btn.action(); }}
                                className="p-3 text-white/50 hover:text-cyan-400 hover:bg-white/5 rounded-2xl transition-all group relative"
                            >
                                <btn.icon className="w-5 h-5" />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-dark-900 border border-white/10 rounded text-[9px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {btn.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Integrated Legend Pill */}
                    <div className="absolute top-6 right-6 flex items-center gap-3 z-30 p-2 glass-morphism rounded-2xl border-white/5 opacity-40 hover:opacity-100 transition-opacity pointer-events-auto">
                        {[
                            { color: 'bg-cyan-500', label: 'Frontier' },
                            { color: 'bg-amber-500', label: 'Masteries' },
                            { color: 'bg-purple-500', label: 'Linked' },
                            { color: 'bg-slate-700', label: 'Locked' }
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-2 px-2 border-r border-white/5 last:border-0 cursor-help group/pill">
                                <div className={`w-1.5 h-1.5 rounded-full ${item.color} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
                                <span className="text-[10px] font-black text-white/60 uppercase tracking-tighter">{item.label}</span>
                            </div>
                        ))}
                    </div>

                </div>

                {/* Sidebar Panel */}
                <AnimatePresence>
                    {isSidebarOpen && (
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
                                            <div className={`h-1.5 w-full ${selectedNode.status === 'COMPLETED' ? 'bg-amber-500' :
                                                selectedNode.status === 'UNLOCKED' ? 'bg-cyan-500' : 'bg-slate-700'
                                                }`} />

                                            <div className="p-8 flex flex-col h-full">
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 flex items-center gap-2">
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
                                                                    className="flex flex-col items-center justify-center p-6 glass-morphism border-white/5 rounded-[2rem] hover:border-cyan-500/50 transition-all group"
                                                                >
                                                                    <Timer className="w-6 h-6 text-white mb-2 group-hover:scale-110 transition-transform" />
                                                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Deep Focus</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => navigate('/practice', { state: { searchTarget: selectedNode.name } })}
                                                                    className="flex flex-col items-center justify-center p-6 glass-morphism border-white/5 rounded-[2rem] hover:border-primary-500/50 transition-all group"
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
                                                                    <Sparkles className="w-10 h-10 text-cyan-500 animate-pulse mb-4" />
                                                                    <p className="text-[9px] font-black uppercase tracking-widest">Generating Active Intel</p>
                                                                </div>
                                                            ) : activeIntel ? (
                                                                <div className="space-y-4 animate-fade-in">
                                                                    {/* Insight Card */}
                                                                    <div className="p-5 bg-gradient-to-br from-cyan-900/20 to-transparent rounded-3xl border border-cyan-500/20">
                                                                        <div className="flex items-center gap-2 mb-3">
                                                                            <Sparkles className="w-4 h-4 text-cyan-400" />
                                                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Key Insight</h4>
                                                                        </div>
                                                                        <p className="text-white text-sm font-medium leading-relaxed">
                                                                            "{activeIntel.insight}"
                                                                        </p>
                                                                    </div>

                                                                    {/* Analogy Card */}
                                                                    <div className="p-5 bg-gradient-to-br from-amber-900/20 to-transparent rounded-3xl border border-amber-500/20">
                                                                        <div className="flex items-center gap-2 mb-3">
                                                                            <Compass className="w-4 h-4 text-amber-400" />
                                                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-200">Mental Model</h4>
                                                                        </div>
                                                                        <p className="text-white text-sm font-medium leading-relaxed italic">
                                                                            {activeIntel.analogy}
                                                                        </p>
                                                                    </div>

                                                                    {/* Socratic Question */}
                                                                    <div className="p-5 bg-gradient-to-br from-purple-900/20 to-transparent rounded-3xl border border-purple-500/20">
                                                                        <div className="flex items-center gap-2 mb-3">
                                                                            <HelpCircle className="w-4 h-4 text-purple-400" />
                                                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-purple-200">Challenge</h4>
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
                                        <div className="w-20 h-20 bg-dark-900 border border-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-all duration-500 shadow-xl group-hover:shadow-cyan-500/20">
                                            <Network className="w-8 h-8 text-dark-600 group-hover:text-cyan-400 transition-colors" />
                                        </div>
                                        <h4 className="text-white text-[10px] font-black uppercase tracking-[0.2em] mb-3">Select Node</h4>
                                        <p className="text-[10px] text-dark-500 leading-relaxed font-medium max-w-[180px] mb-8">
                                            Intercept a neural packet from the tree to examine properties.
                                        </p>

                                        {/* Integrated Legend */}
                                        <div className="flex flex-col gap-3 w-full max-w-[160px]">
                                            {[
                                                { color: 'bg-cyan-500', label: 'Frontier', desc: 'Unlocked Concepts' },
                                                { color: 'bg-amber-500', label: 'Mastered', desc: 'Core Stability' },
                                                { color: 'bg-slate-700', label: 'Locked', desc: 'Hidden Nodes' }
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center gap-3 p-2 bg-white/5 rounded-xl border border-white/5">
                                                    <div className={`w-2 h-2 rounded-full ${item.color} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
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
                            className="w-full max-w-3xl glass-morphism p-10 rounded-[3rem] relative border border-white/10 shadow-2xl"
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
                                        className="w-full px-4 py-3 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-cyan-500/40"
                                        value={graphForm.name}
                                        onChange={(e) => setGraphForm({ ...graphForm, name: e.target.value })}
                                        placeholder="e.g. Biology Core"
                                    />
                                    <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Description</label>
                                    <textarea
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-cyan-500/40"
                                        value={graphForm.description}
                                        onChange={(e) => setGraphForm({ ...graphForm, description: e.target.value })}
                                        placeholder="Purpose and focus of this graph"
                                    />
                                    <div className="pt-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">LLM Settings</label>
                                        <div className="grid grid-cols-1 gap-3 mt-2">
                                            <input
                                                className="w-full px-4 py-2 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-primary-500/50"
                                                value={graphForm.llm_config.provider || ''}
                                                onChange={(e) => setGraphForm({ ...graphForm, llm_config: { ...graphForm.llm_config, provider: e.target.value } })}
                                                placeholder="provider (openai, groq, ollama)"
                                            />
                                            <input
                                                className="w-full px-4 py-2 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-primary-500/50"
                                                value={graphForm.llm_config.model || ''}
                                                onChange={(e) => setGraphForm({ ...graphForm, llm_config: { ...graphForm.llm_config, model: e.target.value } })}
                                                placeholder="model"
                                            />
                                            <input
                                                className="w-full px-4 py-2 rounded-2xl bg-dark-900/60 border border-white/5 text-white focus:outline-none focus:border-primary-500/50"
                                                value={graphForm.llm_config.base_url || ''}
                                                onChange={(e) => setGraphForm({ ...graphForm, llm_config: { ...graphForm.llm_config, base_url: e.target.value } })}
                                                placeholder="base_url (optional)"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-dark-500">Documents</label>
                                    <div className="mt-3 max-h-72 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                                    {documents.length === 0 && (
                                        <div className="text-xs text-dark-500 py-4">No documents found.</div>
                                    )}
                                    {documents.map((doc) => (
                                        <button
                                            key={doc.id}
                                            onClick={() => toggleDocumentSelection(doc.id)}
                                            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${graphForm.document_ids.includes(doc.id) ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/5 bg-dark-900/40 hover:bg-white/5'}`}
                                        >
                                                <div className="text-left">
                                                    <div className="text-sm text-white font-semibold">{doc.title || doc.filename}</div>
                                                    <div className="text-[10px] text-dark-400">{doc.status}</div>
                                                </div>
                                                <div className={`w-3 h-3 rounded-full ${graphForm.document_ids.includes(doc.id) ? 'bg-cyan-400' : 'bg-dark-700'}`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8">
                                <button onClick={() => setShowGraphModal(false)} className="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest text-dark-400 hover:text-white">
                                    Cancel
                                </button>
                                <button onClick={handleSaveGraph} className="px-5 py-2 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-xs font-black uppercase tracking-widest text-white">
                                    Save Graph
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Build Modal */}
            <AnimatePresence>
                {showBuildModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-dark-950/90 backdrop-blur-3xl"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-xl glass-morphism p-10 rounded-[3rem] relative border border-white/10 shadow-2xl"
                        >
                            <button onClick={() => setShowBuildModal(false)} className="absolute top-8 right-8 text-dark-400 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                            <h3 className="text-2xl font-black text-white mb-6 tracking-tighter">Build Mode</h3>
                            <div className="space-y-4">
                                <label className="flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-dark-900/50">
                                    <input
                                        type="radio"
                                        name="buildMode"
                                        value="existing"
                                        checked={buildMode === 'existing'}
                                        onChange={() => setBuildMode('existing')}
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-white">Use Existing</div>
                                        <div className="text-[10px] text-dark-400">Build from existing document graphs</div>
                                    </div>
                                </label>
                                <label className="flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-dark-900/50">
                                    <input
                                        type="radio"
                                        name="buildMode"
                                        value="rebuild"
                                        checked={buildMode === 'rebuild'}
                                        onChange={() => setBuildMode('rebuild')}
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-white">Rebuild</div>
                                        <div className="text-[10px] text-dark-400">Re-run extraction with LLM</div>
                                    </div>
                                </label>
                            </div>
                            <div className="mt-6">
                                <p className="text-xs font-bold uppercase tracking-widest text-dark-500 mb-3">Source Text</p>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { value: 'filtered', label: 'Filtered Core' },
                                        { value: 'raw', label: 'Raw Full Text' }
                                    ].map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => setBuildSourceMode(option.value)}
                                            className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${buildSourceMode === option.value ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40' : 'bg-dark-900/40 text-dark-400 border-white/5 hover:border-white/10'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-dark-500 mt-3">
                                    Filtered mode removes boilerplate and repeats to focus on key concepts.
                                </p>
                            </div>
                            {buildError && (
                                <div className="text-xs text-amber-400 mt-4">{buildError}</div>
                            )}
                            <div className="flex justify-end gap-3 mt-8">
                                <button onClick={() => setShowBuildModal(false)} className="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest text-dark-400 hover:text-white">
                                    Cancel
                                </button>
                                <button onClick={handleBuildGraph} disabled={isGraphLoading} className="px-5 py-2 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-xs font-black uppercase tracking-widest text-white">
                                    {isGraphLoading ? 'Building...' : 'Build'}
                                </button>
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
                                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-xs font-black uppercase tracking-widest text-white"
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
                                                className="px-5 py-2 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-xs font-black uppercase tracking-widest text-white"
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
                                <button onClick={() => setShowGuide(false)} className="text-dark-400 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <h3 className="text-3xl font-black text-white mb-8 tracking-tighter">Tree Navigation</h3>

                            <div className="space-y-8">
                                <div className="flex gap-6 items-start">
                                    <div className="w-12 h-12 rounded-3xl bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/30">
                                        <Sparkles className="w-6 h-6 text-cyan-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-black text-xs uppercase tracking-widest mb-2">The Frontier (Cyan)</h4>
                                        <p className="text-xs text-dark-400 leading-relaxed">These are concepts you have unlocked. They are the next step in your cognitive evolution.</p>
                                    </div>
                                </div>
                                <div className="flex gap-6 items-start">
                                    <div className="w-12 h-12 rounded-3xl bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/30">
                                        <CheckCircle2 className="w-6 h-6 text-amber-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-black text-xs uppercase tracking-widest mb-2">Stability (Amber)</h4>
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

                            <button onClick={() => setShowGuide(false)} className="btn-primary w-full mt-12 py-4 font-black text-xs uppercase tracking-[0.3em] rounded-3xl">
                                Proceed to Nexus
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default KnowledgeGraph;
