import React, { useEffect, useState, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
    Network,
    RefreshCw,
    Zap,
    Layers,
    Info,
    Search,
    ChevronRight,
    Loader2,
    HelpCircle,
    X,
    MousePointer2,
    Move,
    Maximize2,
    UploadCloud,
    Brain,
    Radio
} from 'lucide-react';
import ConceptService from '../services/concepts';
import useFlashcardStore from '../stores/useFlashcardStore';
import Card from '../components/ui/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Animated Starfield Background Component
 */
const Starfield = () => (
    <div className="universe-stars overflow-hidden">
        <div className="star-layer-1 absolute inset-0 opacity-50" />
        <div className="star-layer-2 absolute inset-0 opacity-40" />
        <div className="absolute inset-0 cosmic-nebula opacity-30" />
    </div>
);

/**
 * Knowledge Map Page Component.
 * Overhauled with 'Universe' aesthetics and a comprehensive interaction guide.
 */
const KnowledgeGraph = () => {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showGuide, setShowGuide] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const fgRef = useRef();
    const containerRef = useRef();

    // Use ResizeObserver for robust dimension management
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

    const fetchGraph = async (showSyncEffect = false) => {
        if (showSyncEffect) setIsSyncing(true);
        else setIsLoading(true);

        try {
            const data = await ConceptService.getGraph();
            console.log("Graph data received:", data);

            if (!data || !data.nodes) {
                console.warn("No graph data or nodes received");
                setGraphData({ nodes: [], links: [] });
                return;
            }

            const nodeSource = data.nodes || [];
            const edgeSource = data.links || data.edges || [];

            // Robust validation of data
            const validNodes = nodeSource.filter(n => n && (n.id || n.name));
            const nodeIds = new Set(validNodes.map(n => n.id || n.name));

            const formattedData = {
                nodes: validNodes.map(n => ({
                    id: n.id || n.name,
                    name: n.name || 'Unknown Concept',
                    description: n.description || '',
                    val: 12 + (edgeSource.filter(e => e && (e.source_id === (n.id || n.name) || e.target_id === (n.id || n.name))).length * 3)
                })),
                links: edgeSource
                    .filter(e => e && e.source_id && e.target_id && nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
                    .map(e => ({
                        source: e.source_id,
                        target: e.target_id,
                        label: e.relation_type || 'PREREQUISITE'
                    }))
            };

            console.log("Formatted graph data:", formattedData);
            setGraphData(formattedData);

            // Show guide automatically on first load with no data
            if (formattedData.nodes.length === 0 && !showSyncEffect) {
                setShowGuide(true);
            }
        } catch (error) {
            console.error("Failed to fetch graph", error);
            setGraphData({ nodes: [], links: [] });
        } finally {
            setIsLoading(false);
            if (showSyncEffect) {
                setTimeout(() => setIsSyncing(false), 1000);
            }
        }
    };

    useEffect(() => {
        fetchGraph();
    }, []);

    const handleNodeClick = (node) => {
        if (!node || typeof node.x !== 'number' || !fgRef.current) return;
        setSelectedNode(node);
        fgRef.current.centerAt(node.x, node.y, 800);
        fgRef.current.zoom(3, 800);
    };

    const filteredNodes = useMemo(() => {
        if (!searchQuery) return graphData.nodes;
        return graphData.nodes.filter(n =>
            n.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery, graphData.nodes]);

    // Custom Node Rendering for Galaxy/Star Effect
    const paintNode = (node, ctx, globalScale) => {
        // Defensive checks to prevent canvas crashes on invalid data
        if (typeof node.x !== 'number' || typeof node.y !== 'number') return;

        const label = node.name || '...';
        const safeScale = globalScale || 1;
        const fontSize = 12 / safeScale;

        ctx.font = `${fontSize}px Outfit, sans-serif`;

        // Draw Glow
        const nodeVal = node.val || 12;
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, nodeVal);
        const isSelected = selectedNode?.id === node.id;

        if (isSelected) {
            gradient.addColorStop(0, '#a855f7');
            gradient.addColorStop(0.4, 'rgba(168, 85, 247, 0.4)');
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
        } else {
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(0.4, 'rgba(99, 102, 241, 0.2)');
            gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeVal * 2.5, 0, 2 * Math.PI, false);
        ctx.fill();

        // Draw Core
        ctx.fillStyle = isSelected ? '#fff' : '#c4b5fd';
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeVal / 4, 0, 2 * Math.PI, false);
        ctx.fill();

        // Draw Label
        if (safeScale > 1.5 || isSelected) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isSelected ? '#fff' : 'rgba(255, 255, 255, 0.8)';
            ctx.fillText(label, node.x, node.y + nodeVal + 6);
        }
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col gap-6 animate-fade-in relative z-10 font-sans">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 flex items-center gap-3">
                        Knowledge Map
                    </h1>
                    <p className="text-dark-400 mt-1 font-medium italic">Navigating your intellectual galaxy.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                        <input
                            type="text"
                            placeholder="Find a concept..."
                            className="glass-light border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary-500/50 w-64"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setShowGuide(true)}
                        className="p-2.5 glass-light border-white/5 rounded-xl text-dark-400 hover:text-primary-400 transition-all shadow-lg active:scale-95"
                        title="Instruction Guide"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => fetchGraph(true)}
                        className="btn-primary py-2.5 px-5 flex items-center gap-2 shadow-xl shadow-primary-500/10"
                        disabled={isSyncing}
                    >
                        <Radio className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />
                        <span className="font-bold">Sync Intelligence</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Graph Viewport */}
                <div
                    ref={containerRef}
                    className="flex-1 cosmic-card rounded-[2.5rem] relative overflow-hidden group min-h-[400px]"
                >
                    <div className="absolute inset-0 z-0">
                        <Starfield />
                    </div>

                    {(isLoading || isSyncing) ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-dark-950/40 backdrop-blur-sm">
                            <div className="relative">
                                <Loader2 className="w-16 h-16 text-primary-500 animate-spin" />
                                <div className="absolute inset-0 blur-xl bg-primary-500/20 animate-pulse rounded-full" />
                            </div>
                            <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-primary-400 text-glow">Mapping Neural Stars...</p>
                        </div>
                    ) : graphData.nodes.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center p-12">
                            <div className="w-24 h-24 rounded-full bg-white/5 border border-dashed border-white/10 flex items-center justify-center mb-8">
                                <Radio className="w-12 h-12 text-dark-600 animate-pulse" />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-4">Galaxy is Empty</h3>
                            <p className="text-dark-400 max-w-sm mx-auto mb-10 leading-relaxed font-medium">
                                Your neural map is waiting for data. Follow the initialization guide to start populating your knowledge galaxy.
                            </p>
                            <button
                                onClick={() => setShowGuide(true)}
                                className="btn-secondary py-3 px-8 rounded-2xl font-black uppercase tracking-widest text-xs"
                            >
                                View Initialization Guide
                            </button>
                        </div>
                    ) : dimensions.width > 0 ? (
                        <div className="relative z-10 w-full h-full">
                            <ForceGraph2D
                                ref={fgRef}
                                graphData={graphData}
                                nodeCanvasObject={paintNode}
                                nodePointerAreaPaint={(node, color, ctx) => {
                                    if (!node || typeof node.x !== 'number' || typeof node.y !== 'number') return;
                                    ctx.fillStyle = color;
                                    ctx.beginPath();
                                    ctx.arc(node.x, node.y, (node.val || 12) * 2, 0, 2 * Math.PI, false);
                                    ctx.fill();
                                }}
                                linkColor={() => 'rgba(139, 92, 246, 0.15)'}
                                linkDirectionalParticles={3}
                                linkDirectionalParticleSpeed={0.005}
                                linkDirectionalParticleWidth={1.5}
                                linkDirectionalParticleColor={() => '#a855f7'}
                                onNodeClick={handleNodeClick}
                                backgroundColor="rgba(0,0,0,0)"
                                width={dimensions.width}
                                height={dimensions.height}
                                cooldownTicks={100}
                                d3AlphaMin={0.01}
                            />
                        </div>
                    ) : null}

                    {/* Instruction Guide Overlay */}
                    <AnimatePresence>
                        {showGuide && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-dark-950/70 backdrop-blur-md"
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    className="max-w-2xl w-full glass-morphism p-10 rounded-[2.5rem] relative border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)] flex flex-col md:flex-row gap-10"
                                >
                                    <button
                                        onClick={() => setShowGuide(false)}
                                        className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-dark-500 hover:text-white z-10"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>

                                    {/* Left Side: Initialization */}
                                    <div className="flex-1 space-y-6">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-primary-500/20 rounded-xl">
                                                <Zap className="w-5 h-5 text-primary-400" />
                                            </div>
                                            <h3 className="text-xl font-black text-white uppercase tracking-wider">Initialization</h3>
                                        </div>

                                        {[
                                            { step: 1, icon: UploadCloud, label: 'Upload', desc: 'Add PDFs or links in the Documents library.' },
                                            { step: 2, icon: Brain, label: 'Analyze', desc: 'Enter "Study" mode. AI extracts concepts as you read.' },
                                            { step: 3, icon: Radio, label: 'Sync', desc: 'Click "Sync Intelligence" here to refresh the map.' }
                                        ].map((item) => (
                                            <div key={item.step} className="flex gap-4 group">
                                                <div className="shrink-0 flex flex-col items-center">
                                                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-primary-400 group-hover:bg-primary-500/10 transition-colors">
                                                        <item.icon className="w-5 h-5" />
                                                    </div>
                                                    {item.step < 3 && <div className="w-px h-full bg-white/10 my-1" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-black text-primary-500/50 uppercase">Step {item.step}</span>
                                                        <h4 className="font-bold text-white text-sm uppercase tracking-wider">{item.label}</h4>
                                                    </div>
                                                    <p className="text-[11px] text-dark-500 leading-relaxed mt-0.5">{item.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Divider */}
                                    <div className="hidden md:block w-px bg-white/10" />

                                    {/* Right Side: Navigation */}
                                    <div className="flex-1 space-y-6">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-indigo-500/20 rounded-xl">
                                                <Move className="w-5 h-5 text-indigo-400" />
                                            </div>
                                            <h3 className="text-xl font-black text-white uppercase tracking-wider">Navigation</h3>
                                        </div>

                                        {[
                                            { icon: MousePointer2, label: 'Inspect', desc: 'Click a star to view its definition & cards.' },
                                            { icon: Maximize2, label: 'Focus', desc: 'Selected stars are automatically centered.' },
                                            { icon: Move, label: 'Explore', desc: 'Pan by dragging. Scroll to zoom galaxy.' }
                                        ].map((tool, i) => (
                                            <div key={i} className="flex gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                                                    <tool.icon className="w-5 h-5 text-indigo-400" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm uppercase tracking-wider">{tool.label}</h4>
                                                    <p className="text-[11px] text-dark-500 leading-relaxed mt-0.5">{tool.desc}</p>
                                                </div>
                                            </div>
                                        ))}

                                        <button
                                            onClick={() => setShowGuide(false)}
                                            className="btn-primary w-full mt-6 py-4 font-black tracking-widest uppercase text-xs shadow-2xl"
                                        >
                                            Begin Exploration
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Information Sidebar */}
                <div className="w-80 flex flex-col gap-6">
                    <AnimatePresence mode="wait">
                        {selectedNode ? (
                            <motion.div
                                key={selectedNode.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="h-full"
                            >
                                <Card className="h-full flex flex-col bg-dark-900/60 border-primary-500/20 backdrop-blur-xl">
                                    <div className="flex items-center justify-between mb-8">
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary-400">Concept Data</span>
                                        <button
                                            onClick={() => setSelectedNode(null)}
                                            className="p-1.5 hover:bg-white/5 rounded-lg text-dark-500 hover:text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <h3 className="text-2xl font-black text-white leading-tight mb-4 drop-shadow-md">
                                        {selectedNode.name}
                                    </h3>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                        <p className="text-sm text-dark-300 leading-relaxed mb-10 italic">
                                            "{selectedNode.description || 'This star represents a key node in your intellectual constellation.'}"
                                        </p>
                                    </div>

                                    <div className="space-y-6 mt-6 pt-6 border-t border-white/5">
                                        <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/5">
                                            <div className="flex justify-between items-end mb-3">
                                                <span className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Connectivity</span>
                                                <span className="text-xs font-mono font-bold text-primary-400">{(selectedNode.val / 20).toFixed(1)}x</span>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(selectedNode.val * 2, 100)}%` }}
                                                    className="h-full bg-primary-500 shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                                                />
                                            </div>
                                        </div>

                                        <button className="btn-primary w-full py-4 group flex items-center justify-center gap-2">
                                            Practice Concept
                                            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                </Card>
                            </motion.div>
                        ) : (
                            <div className="h-full glass-morphism border-dashed border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center p-10 text-center opacity-70 group hover:border-primary-500/30 transition-all duration-500">
                                <div className="w-20 h-20 bg-dark-900 border border-white/5 rounded-full flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                                    <Network className="w-10 h-10 text-dark-600 group-hover:text-primary-500/50 transition-colors" />
                                </div>
                                <h4 className="text-white font-black uppercase tracking-[0.2em] text-xs mb-4">Select a Concept</h4>
                                <p className="text-[11px] text-dark-500 leading-relaxed max-w-[200px]">Click any neural cluster to examine its underlying structure and associated knowledge cards.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeGraph;
