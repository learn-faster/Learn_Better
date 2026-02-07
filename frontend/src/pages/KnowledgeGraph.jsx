import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
    Lock
} from 'lucide-react';
import ConceptService from '../services/concepts';
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
    const { startSession } = useTimerStore();
    const { documents, fetchDocuments } = useDocumentStore();

    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
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
    }, [documents.length]);

    const fetchGraph = async (showSyncEffect = false) => {
        if (showSyncEffect) setIsSyncing(true);
        else if (graphData.nodes.length === 0) setIsLoading(true); // Only show loading if empty

        try {
            const data = await ConceptService.getGraph("default_user");
            if (!data || !data.nodes) {
                setGraphData({ nodes: [], links: [] });
                return;
            }

            // Data Sanitization: Normalize IDs to strings and filter invalid links
            const nodes = data.nodes.map(n => ({ ...n, id: String(n.id) }));
            const nodeIds = new Set(nodes.map(n => n.id));

            const sanitizedLinks = (data.links || []).filter(link => {
                const s = String(link.source?.id || link.source);
                const t = String(link.target?.id || link.target);
                return nodeIds.has(s) && nodeIds.has(t);
            });

            // Calculate Node Degree for Hierarchy-Based Sizing
            const degrees = {};
            sanitizedLinks.forEach(link => {
                const s = String(link.source?.id || link.source);
                const t = String(link.target?.id || link.target);
                degrees[s] = (degrees[s] || 0) + 1;
                degrees[t] = (degrees[t] || 0) + 1;
            });

            const sizedNodes = nodes.map(node => ({
                ...node,
                // Scale size between 4 and 18 based on degree
                val: 4 + Math.min((degrees[node.id] || 0) * 1.5, 14)
            }));

            setGraphData({ nodes: sizedNodes, links: sanitizedLinks });

            // Auto-zoom to fit after a short delay (only on first load)
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

    useEffect(() => {
        fetchGraph();
    }, []);

    // Smart Search Logic
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchSuggestions([]);
            return;
        }
        const lowerQuery = searchQuery.toLowerCase();
        const suggestions = graphData.nodes
            .filter(n => n.name.toLowerCase().includes(lowerQuery))
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
        const isImportant = node.status === 'UNLOCKED' || node.status === 'IN_PROGRESS' || node.status === 'COMPLETED';
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
        <div className="h-[calc(100vh-2rem)] flex flex-col gap-4 animate-fade-in relative z-10 font-sans pb-2">
            {/* Header with Integrated Smart Search */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pointer-events-auto">
                <div className="relative group">
                    <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-cyan-400 to-primary-600 flex items-center gap-3">
                        Neural Tree
                    </h1>
                    <div className="absolute -bottom-1 left-0 w-0 h-1 bg-cyan-500 group-hover:w-full transition-all duration-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                </div>

                <div className="flex items-center gap-4">
                    {/* Smart Search Container */}
                    <div className="relative w-80">
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
                                                node.status === 'UNLOCKED' ? 'bg-cyan-400' : 'bg-slate-600'
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

                    {isLoading ? (
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
                                if (!selectedNode || !link) return 'rgba(255, 255, 255, 0.15)'; // Brighter default
                                const sId = String(link.source?.id || link.source);
                                const tId = String(link.target?.id || link.target);
                                const nId = String(selectedNode.id);
                                const isConnected = sId === nId || tId === nId;
                                return isConnected ? 'rgba(6, 182, 212, 0.6)' : 'rgba(255, 255, 255, 0.05)';
                            }}
                            linkWidth={(link) => {
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
