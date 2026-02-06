import React, { useEffect, useState } from 'react';
import {
    Plus,
    Search,
    FileText,
    ImageIcon,
    Trash2,
    BookOpen,
    Folder,
    FolderPlus,
    ChevronRight,
    MoreVertical,
    Edit3,
    Grid3X3,
    List,
    X,
    Check,
    Link as LinkIcon,
    Globe,
    FileCode,
    Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import FileUpload from '../components/documents/FileUpload';
import { motion, AnimatePresence } from 'framer-motion';
import useDocumentStore from '../stores/useDocumentStore';

// Icon colors for different file types
const TYPE_COLORS = {
    pdf: 'text-rose-400',
    link: 'text-cyan-400',
    markdown: 'text-amber-400',
    image: 'text-fuchsia-400',
    default: 'text-slate-400'
};

// Premium Folder Colors
const FOLDER_COLORS = [
    '#F43F5E', '#06B6D4', '#10B981', '#F59E0B',
    '#8B5CF6', '#EC4899', '#6366F1', '#94A3B8'
];

const Documents = () => {
    const {
        documents,
        folders,
        selectedFolderId,
        isLoading,
        fetchDocuments,
        fetchFolders,
        deleteDocument,
        createFolder,
        deleteFolder,
        setSelectedFolder,
        moveToFolder
    } = useDocumentStore();

    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [sortBy, setSortBy] = useState('date'); // 'date', 'title', 'progress'
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        fetchDocuments();
        fetchFolders();
    }, [fetchDocuments, fetchFolders]);

    // Prevent background scrolling when modals are open
    useEffect(() => {
        if (isUploadOpen || showFolderModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isUploadOpen, showFolderModal]);

    // Polling effect: Check for processing documents every 3 seconds
    useEffect(() => {
        const hasProcessingDocs = documents.some(d => d.status === 'processing' || d.status === 'pending');

        let interval;
        if (hasProcessingDocs) {
            interval = setInterval(() => {
                fetchDocuments();
            }, 3000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [documents, fetchDocuments]);

    // Filter documents by selected folder and search
    const filteredDocs = documents
        .filter(doc => {
            const matchesFolder = selectedFolderId === null ||
                (selectedFolderId === 'unfiled' ? !doc.folder_id : doc.folder_id === selectedFolderId);
            const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (doc.category && doc.category.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchesFolder && matchesSearch;
        })
        .sort((a, b) => {
            if (sortBy === 'title') return a.title.localeCompare(b.title);
            if (sortBy === 'progress') return (b.reading_progress || 0) - (a.reading_progress || 0);
            return new Date(b.created_at || b.upload_date) - new Date(a.created_at || a.upload_date);
        });

    // Count unfiled documents
    const unfiledCount = documents.filter(d => !d.folder_id).length;

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await createFolder({ name: newFolderName, color: newFolderColor });
            setNewFolderName('');
            setNewFolderColor(FOLDER_COLORS[0]);
            setShowFolderModal(false);
        } catch (err) {
            console.error('Failed to create folder:', err);
            alert('Failed to create folder. Please try again.');
        }
    };

    const handleMoveToFolder = async (docId, folderId) => {
        await moveToFolder(docId, folderId);
        setContextMenu(null);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8 h-full min-h-[calc(100vh-6rem)]">
            {/* Sidebar Folder Navigation */}
            <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
                <div className="bg-dark-900/40 rounded-[2.5rem] p-6 flex flex-col h-full lg:h-[calc(100vh-10rem)] sticky top-6 border border-white/5 shadow-2xl overflow-hidden backdrop-blur-md">
                    <div className="flex items-center justify-between mb-8 px-3 pt-6">
                        <div className="flex flex-col">
                            <h3 className="text-[10px] font-black text-primary-500 uppercase tracking-[0.3em] leading-none">Neural Core</h3>
                            <span className="text-[9px] text-dark-600 font-bold uppercase tracking-[0.2em] mt-2">Knowledge Graph</span>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowFolderModal(true)}
                            className="p-3 bg-white/5 hover:bg-white/10 text-primary-400 rounded-2xl transition-all border border-white/5 group shadow-lg"
                            title="Create Segment"
                        >
                            <Plus className="w-5 h-5" />
                        </motion.button>
                    </div>

                    <div className="space-y-2 px-1 pb-8 border-b border-white/10">
                        {/* All Documents */}
                        <button
                            onClick={() => setSelectedFolder(null)}
                            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-500 ${selectedFolderId === null
                                ? 'bg-gradient-to-br from-primary-600/40 to-primary-500/10 text-white border border-primary-500/40 shadow-[0_20px_40px_-12px_rgba(244,63,94,0.3)]'
                                : 'hover:bg-white/5 text-dark-400'
                                }`}
                        >
                            <div className={`p-2.5 rounded-xl ${selectedFolderId === null ? 'bg-primary-500/20 text-primary-300' : 'bg-white/5 text-dark-500'}`}>
                                <Folder className="w-4.5 h-4.5" />
                            </div>
                            <span className="flex-1 font-black text-xs uppercase tracking-widest">The Whole</span>
                            <span className="text-[10px] font-black bg-white/10 px-2.5 py-1 rounded-lg opacity-60">{documents.length}</span>
                        </button>

                        {/* Unfiled */}
                        <button
                            onClick={() => setSelectedFolder('unfiled')}
                            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-500 ${selectedFolderId === 'unfiled'
                                ? 'bg-gradient-to-br from-primary-600/40 to-primary-500/10 text-white border border-primary-500/40 shadow-[0_20px_40px_-12px_rgba(244,63,94,0.3)]'
                                : 'hover:bg-white/5 text-dark-400'
                                }`}
                        >
                            <div className={`p-2.5 rounded-xl ${selectedFolderId === 'unfiled' ? 'bg-primary-500/20 text-primary-300' : 'bg-white/5 text-dark-500'}`}>
                                <FileText className="w-4.5 h-4.5" />
                            </div>
                            <span className="flex-1 font-black text-xs uppercase tracking-widest">Unlinked</span>
                            <span className="text-[10px] font-black bg-white/10 px-2.5 py-1 rounded-lg opacity-60">{unfiledCount}</span>
                        </button>
                    </div>

                    {/* Scrollable Folder List */}
                    <div className="flex-1 overflow-y-auto mt-6 px-1 space-y-2 custom-scrollbar pr-2">
                        {folders.length > 0 ? (
                            folders.map((folder) => (
                                <button
                                    key={folder.id}
                                    onClick={() => setSelectedFolder(folder.id)}
                                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-500 group ${selectedFolderId === folder.id
                                        ? 'bg-gradient-to-br from-white/10 to-transparent text-white border border-white/20 shadow-xl'
                                        : 'hover:bg-white/5 text-dark-400'
                                        }`}
                                >
                                    <div
                                        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-white/10 shadow-lg"
                                        style={{ backgroundColor: folder.color + '15' }}
                                    >
                                        <Folder className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color: folder.color }} />
                                    </div>
                                    <span className="flex-1 font-bold text-xs truncate tracking-wide">{folder.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black bg-white/5 px-2.5 py-1 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity">
                                            {folder.document_count}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Vaporize segment "${folder.name}"? Materials will be unlinked.`)) {
                                                    deleteFolder(folder.id);
                                                }
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-500/20 rounded-xl text-rose-500 transition-all active:scale-90"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="py-12 text-center space-y-4 opacity-20">
                                <div className="p-6 rounded-[2rem] bg-white/5 w-fit mx-auto border border-white/10">
                                    <Sparkles className="w-8 h-8 mx-auto text-primary-400" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Segments Created</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Library View */}
            <div className="flex-1 space-y-12">
                {/* Immersive Header */}
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 pt-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 font-black tracking-[0.2em] uppercase text-[9px] flex items-center gap-2"
                            >
                                <Sparkles className="w-3 h-3" /> Cognitive Storage
                            </motion.div>
                            <span className="w-1 h-1 rounded-full bg-dark-700" />
                            <span className="text-[10px] text-dark-500 font-black uppercase tracking-widest px-1">
                                {documents.length} Units Synthetic
                            </span>
                        </div>
                        <h1 className="text-6xl font-black tracking-tighter text-white leading-tight">
                            {selectedFolderId === null ? 'The Archive' :
                                selectedFolderId === 'unfiled' ? 'Drifting' :
                                    folders.find(f => f.id === selectedFolderId)?.name}
                        </h1>
                        <p className="text-dark-400 text-lg font-medium max-w-xl leading-relaxed opacity-70">
                            {selectedFolderId === null ? 'High-fidelity repository for your synthesized intellectual assets.' :
                                `Recursive analysis of ${folders.find(f => f.id === selectedFolderId)?.name || 'this segment'}.`}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 shadow-inner">
                            {[
                                { id: 'date', label: 'Recent' },
                                { id: 'title', label: 'Name' },
                                { id: 'progress', label: 'Sync' }
                            ].map(option => (
                                <button
                                    key={option.id}
                                    onClick={() => setSortBy(option.id)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === option.id ? 'bg-white/10 text-white shadow-lg' : 'text-dark-500 hover:text-dark-300'}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-primary-500 text-white shadow-xl shadow-primary-500/20' : 'text-dark-500 hover:text-white'}`}
                            >
                                <Grid3X3 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-primary-500 text-white shadow-xl shadow-primary-500/20' : 'text-dark-500 hover:text-white'}`}
                            >
                                <List className="w-5 h-5" />
                            </button>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setIsUploadOpen(!isUploadOpen)}
                            className={`flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl
                                ${isUploadOpen
                                    ? 'bg-dark-800 text-white border border-white/5'
                                    : 'bg-primary-500 text-white shadow-primary-500/10'}`}
                        >
                            {isUploadOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            <span>{isUploadOpen ? 'Cancel' : 'Import Unit'}</span>
                        </motion.button>
                    </div>
                </div>

                {/* Upload Modal */}
                <AnimatePresence>
                    {isUploadOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-950/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setIsUploadOpen(false)}>
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="bg-dark-900 border border-white/10 rounded-[3rem] p-10 w-full max-w-4xl shadow-2xl relative overflow-hidden"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Modal Decorative Elements */}
                                <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary-500/5 blur-[100px] rounded-full" />
                                <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-primary-500/5 blur-[100px] rounded-full" />

                                <div className="flex items-center justify-between mb-8 relative z-10">
                                    <div className="space-y-1">
                                        <h2 className="text-4xl font-black text-white tracking-tighter">Ingest Knowledge</h2>
                                        <p className="text-dark-500 text-[10px] font-black uppercase tracking-[0.3em]">Initialize new data unit for synthesis</p>
                                    </div>
                                    <button
                                        onClick={() => setIsUploadOpen(false)}
                                        className="p-3 hover:bg-white/5 rounded-2xl text-dark-500 transition-all border border-white/10"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="relative z-10">
                                    <FileUpload
                                        onComplete={() => {
                                            setIsUploadOpen(false);
                                            fetchDocuments();
                                        }}
                                        selectedFolderId={selectedFolderId !== 'unfiled' ? selectedFolderId : null}
                                    />
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Toolbar */}
                <div className="relative group max-w-xl">
                    <div className="relative bg-dark-950/50 rounded-2xl p-1 flex items-center border border-white/5 shadow-inner">
                        <div className="p-3 text-dark-600 group-focus-within:text-primary-500 transition-colors">
                            <Search className="w-5 h-5" />
                        </div>
                        <input
                            type="text"
                            placeholder="Filter neural repository..."
                            className="bg-transparent border-none focus:ring-0 w-full text-base font-medium placeholder:text-dark-700 text-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="hidden sm:flex gap-1 p-1">
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="p-2 hover:bg-white/5 rounded-xl text-dark-500 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Documents Content */}
                {isLoading ? (
                    <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-4"}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className={`${viewMode === 'grid' ? 'aspect-[4/3]' : 'h-24'} rounded-3xl animate-pulse bg-white/5 border border-white/5`} />
                        ))}
                    </div>
                ) : filteredDocs.length > 0 ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-8">
                                <AnimatePresence mode="popLayout">
                                    {filteredDocs.map((doc, idx) => (
                                        <motion.div
                                            key={doc.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="group relative bg-dark-900/60 rounded-[2.5rem] p-8 transition-all duration-500 border border-white/5 hover:border-white/10 overflow-hidden shadow-xl flex flex-col justify-between h-[480px] hover:shadow-2xl hover:translate-y-[-4px] backdrop-blur-sm"
                                        >
                                            {/* Subtle Accent Glow */}
                                            <div className={`absolute -top-24 -right-24 w-64 h-64 bg-primary-500/5 blur-[100px] group-hover:bg-primary-500/10 transition-colors -z-10`} />

                                            {/* Top Actions HUD */}
                                            <div className="flex items-start justify-between mb-12 translate-y-2 group-hover:translate-y-0 transition-all duration-500">
                                                <div className="p-5 rounded-2xl bg-dark-800/50 border border-white/5 shadow-lg group-hover:border-white/10 transition-colors">
                                                    {doc.file_type === 'pdf' ? (
                                                        <FileText className={`w-10 h-10 ${TYPE_COLORS.pdf} group-hover:scale-110 transition-transform`} />
                                                    ) : doc.file_type === 'link' ? (
                                                        <Globe className={`w-10 h-10 ${TYPE_COLORS.link} group-hover:scale-110 transition-transform`} />
                                                    ) : (doc.file_type === 'markdown' || doc.file_type === 'text') ? (
                                                        <FileCode className={`w-10 h-10 ${TYPE_COLORS.markdown} group-hover:scale-110 transition-transform`} />
                                                    ) : (
                                                        <ImageIcon className={`w-10 h-10 ${TYPE_COLORS.image} group-hover:scale-110 transition-transform`} />
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
                                                        }}
                                                        className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-dark-500 hover:text-white transition-all border border-white/10 active:scale-90 shadow-lg"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm("Purge this unit from memory?")) deleteDocument(doc.id);
                                                        }}
                                                        className="p-4 bg-white/5 hover:bg-rose-500/20 rounded-2xl text-dark-500 hover:text-rose-400 transition-all border border-white/10 active:scale-90 shadow-lg"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Content Body */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                                                        <span className="text-[10px] font-black text-dark-400 uppercase tracking-[0.2em] leading-none">
                                                            {doc.file_type} Unit
                                                        </span>
                                                    </div>
                                                    {doc.status !== 'completed' && doc.status !== 'success' && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                                                            <span className="text-[10px] font-black text-primary-500 uppercase tracking-widest">Processing</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <h3 className="font-black text-3xl text-white leading-[1.2] line-clamp-2 min-h-[4.5rem] tracking-tight group-hover:text-primary-300 transition-colors drop-shadow-lg">
                                                    {doc.title}
                                                </h3>

                                                {/* AI Insight Preview */}
                                                <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/5 mt-4 min-h-[100px] group-hover:bg-white/[0.06] transition-all overflow-hidden relative backdrop-blur-sm">
                                                    <div className="absolute top-0 right-0 p-3 opacity-30">
                                                        <Sparkles className="w-5 h-5 text-primary-400" />
                                                    </div>
                                                    <p className="text-xs text-dark-400 italic font-medium leading-[1.6] line-clamp-3">
                                                        {doc.ai_summary || "Initiating neural analysis to synthesize core conceptual vectors and key insights..."}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Progress Footer */}
                                            <div className="mt-8 pt-10 border-t border-white/5 flex items-center justify-between gap-8">
                                                <div className="flex-1 space-y-4">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-[10px] font-black text-dark-500 uppercase tracking-[0.25em]">Assimilation</span>
                                                        <span className="text-xs font-black text-primary-400 tracking-tighter">{Math.round((doc.reading_progress || 0) * 100)}%</span>
                                                    </div>
                                                    <div className="h-3 bg-dark-900/50 rounded-full overflow-hidden border border-white/10 relative shadow-inner">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${(doc.reading_progress || 0) * 100}%` }}
                                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                                            className="h-full bg-gradient-to-r from-primary-600 via-primary-500 to-rose-400 rounded-full shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                                                        />
                                                    </div>
                                                </div>

                                                <Link
                                                    to={doc.status === 'processing' || doc.status === 'pending' ? '#' : `/documents/${doc.id}`}
                                                    className={`aspect-square p-7 rounded-[2.5rem] flex items-center justify-center transition-all shadow-2xl relative group/btn
                                                        ${(doc.status === 'processing' || doc.status === 'pending' || doc.status === 'uploading')
                                                            ? 'bg-dark-800 text-dark-600 cursor-not-allowed'
                                                            : 'bg-gradient-to-br from-primary-500 to-rose-600 text-white hover:scale-110 hover:shadow-primary-500/40 active:scale-95'}`}
                                                >
                                                    <BookOpen className="w-7 h-7" />
                                                    <div className="absolute inset-0 rounded-[2.5rem] bg-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                                </Link>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <AnimatePresence mode="popLayout">
                                    {filteredDocs.map((doc, idx) => (
                                        <motion.div
                                            key={doc.id}
                                            initial={{ opacity: 0, x: -30 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.98 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="group flex items-center gap-8 p-6 rounded-3xl bg-dark-900/40 border border-white/5 hover:border-white/10 hover:bg-dark-900/60 transition-all duration-300 relative overflow-hidden shadow-lg"
                                        >
                                            {/* Subtle Glow */}
                                            <div className="absolute left-0 top-0 w-1 h-full bg-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                                            <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shrink-0 shadow-lg group-hover:border-white/10 transition-colors">
                                                {doc.file_type === 'pdf' ? (
                                                    <FileText className="w-8 h-8 text-primary-400" />
                                                ) : doc.file_type === 'link' ? (
                                                    <Globe className="w-8 h-8 text-cyan-400" />
                                                ) : (doc.file_type === 'markdown' || doc.file_type === 'text') ? (
                                                    <FileCode className="w-8 h-8 text-amber-400" />
                                                ) : (
                                                    <ImageIcon className="w-8 h-8 text-fuchsia-400" />
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0 space-y-3">
                                                <div className="flex items-center gap-4">
                                                    <h3 className="font-black text-2xl text-white truncate group-hover:text-primary-300 transition-colors tracking-tight">
                                                        {doc.title}
                                                    </h3>
                                                    {doc.ai_summary && <Sparkles className="w-4 h-4 text-primary-400 animate-pulse" />}
                                                </div>

                                                <div className="flex items-center gap-10">
                                                    <div className="flex items-center gap-4 w-60 shrink-0">
                                                        <div className="flex-1 h-2 bg-dark-900/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-primary-600 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                                                                style={{ width: `${(doc.reading_progress || 0) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[11px] font-black text-primary-400 tracking-tighter">
                                                            {Math.round((doc.reading_progress || 0) * 100)}%
                                                        </span>
                                                    </div>

                                                    {doc.folder_id && folders.find(f => f.id === doc.folder_id) && (
                                                        <div
                                                            className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border border-white/10 flex items-center gap-2.5 shadow-lg"
                                                            style={{ backgroundColor: folders.find(f => f.id === doc.folder_id)?.color + '15', color: folders.find(f => f.id === doc.folder_id)?.color }}
                                                        >
                                                            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: folders.find(f => f.id === doc.folder_id)?.color }} />
                                                            {folders.find(f => f.id === doc.folder_id)?.name}
                                                        </div>
                                                    )}

                                                    <span className="text-[10px] text-dark-500 font-bold uppercase tracking-[0.2em] opacity-60">
                                                        {doc.file_type} Segment
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 duration-500">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
                                                    }}
                                                    className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-dark-400 border border-white/10 hover:text-white transition-all active:scale-95"
                                                >
                                                    <MoreVertical className="w-5 h-5" />
                                                </button>
                                                <Link
                                                    to={doc.status === 'processing' || doc.status === 'pending' ? '#' : `/documents/${doc.id}`}
                                                    className={`px-10 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl
                                                        ${(doc.status === 'processing' || doc.status === 'pending' || doc.status === 'uploading')
                                                            ? 'bg-dark-800 text-dark-600 cursor-not-allowed'
                                                            : 'bg-primary-500 text-white hover:shadow-primary-500/40 hover:scale-105 active:scale-95'}`}
                                                >
                                                    {doc.status === 'processing' ? 'Syncing...' : 'Access Unit'}
                                                </Link>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 flex flex-col items-center justify-center py-20 px-6"
                    >
                        <div className="relative mb-12">
                            {/* Ambient Glow */}
                            <div className="absolute inset-0 bg-primary-500/10 blur-[100px] rounded-full -z-10 animate-pulse" />

                            <motion.div
                                animate={{ y: [0, -12, 0] }}
                                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                className="w-40 h-40 rounded-[2.5rem] bg-dark-900 border border-white/5 flex items-center justify-center shadow-2xl relative"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent rounded-[2.5rem]" />
                                <BookOpen className="w-16 h-16 text-primary-400 opacity-60" />
                                <div className="absolute -top-3 -right-3 p-4 rounded-2xl bg-dark-800 border border-white/10 shadow-xl">
                                    <Sparkles className="w-6 h-6 text-primary-400" />
                                </div>
                            </motion.div>
                        </div>

                        <div className="text-center space-y-4 mb-16 max-w-lg">
                            <h3 className="text-4xl font-black text-white tracking-tight">
                                {selectedFolderId && selectedFolderId !== 'unfiled' ? 'Segment Null' : 'Archive Initialized'}
                            </h3>
                            <p className="text-dark-400 font-medium leading-relaxed">
                                {selectedFolderId && selectedFolderId !== 'unfiled'
                                    ? 'This intellectual segment is currently void of processed data units.'
                                    : 'The neural repository is active and awaiting data ingestion. Upload documents to begin conceptual synthesis.'}
                            </p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setIsUploadOpen(true)}
                            className="group flex items-center gap-4 px-12 py-5 rounded-2xl bg-white text-dark-950 font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:shadow-primary-500/10 transition-all overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-primary-400 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className="relative z-10 flex items-center gap-3 group-hover:text-white transition-colors">
                                <Plus className="w-5 h-5" /> Ingest Knowledge Unit
                            </span>
                        </motion.button>

                        <div className="mt-20 flex gap-8 opacity-20 group">
                            <div className="flex flex-col items-center gap-2">
                                <div className="h-0.5 w-12 bg-white/20" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Awaiting Uplink</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Context Menu */}
            {
                contextMenu && (
                    <>
                        <div className="fixed inset-0 z-[60] cursor-default" onClick={() => setContextMenu(null)} />
                        <div
                            className="fixed z-[70] bg-dark-900 shadow-2xl border border-white/10 rounded-2xl py-3 min-w-[240px] animate-in fade-in zoom-in-95 duration-200"
                            style={{ left: Math.min(contextMenu.x, window.innerWidth - 260), top: Math.min(contextMenu.y, window.innerHeight - 400) }}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500/50 to-transparent opacity-40" />
                            <p className="px-6 py-3 text-[10px] font-black text-primary-400 uppercase tracking-[0.3em] mb-2 opacity-80">Organize Logic</p>
                            <button
                                onClick={() => handleMoveToFolder(contextMenu.docId, null)}
                                className={`w-full px-6 py-4 text-left text-xs font-black uppercase tracking-widest hover:bg-white/5 flex items-center gap-4 transition-all ${!documents.find(d => d.id === contextMenu.docId)?.folder_id ? 'text-primary-400 bg-white/5' : 'text-dark-300'}`}
                            >
                                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                                    <FileText className="w-4 h-4 opacity-70" />
                                </div>
                                Move to Unlinked
                            </button>
                            <div className="my-3 border-t border-white/5 mx-4" />
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar px-2 space-y-1">
                                {folders.map((folder) => (
                                    <button
                                        key={folder.id}
                                        onClick={() => handleMoveToFolder(contextMenu.docId, folder.id)}
                                        className={`w-full px-4 py-3.5 rounded-2xl text-left text-xs font-black uppercase tracking-widest hover:bg-white/5 flex items-center gap-4 transition-all ${documents.find(d => d.id === contextMenu.docId)?.folder_id === folder.id ? 'text-primary-400 bg-white/5 border border-white/5' : 'text-dark-400'}`}
                                    >
                                        <div className="w-4 h-4 rounded-lg shadow-lg border border-white/10" style={{ backgroundColor: folder.color }} />
                                        <span className="truncate">{folder.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )
            }

            {/* New Folder Modal */}
            {
                showFolderModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowFolderModal(false)}>
                        <div className="bg-dark-900 border border-white/10 rounded-[2.5rem] p-12 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Decorative Blobs */}
                            <div className="absolute -top-24 -left-24 w-60 h-60 bg-primary-500/5 blur-[100px] rounded-full" />
                            <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-primary-500/5 blur-[100px] rounded-full" />

                            <div className="flex items-center justify-between mb-14 relative z-10">
                                <div className="space-y-3">
                                    <h2 className="text-5xl font-black text-white tracking-tighter">New Segment</h2>
                                    <p className="text-dark-500 text-sm font-bold uppercase tracking-widest opacity-60">Categorize your neural synthesis</p>
                                </div>
                                <motion.button
                                    whileHover={{ rotate: 90 }}
                                    onClick={() => setShowFolderModal(false)}
                                    className="p-4 hover:bg-white/5 rounded-[1.5rem] text-dark-500 transition-all border border-white/10"
                                >
                                    <X className="w-8 h-8" />
                                </motion.button>
                            </div>

                            <div className="space-y-12 relative z-10">
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-primary-400 uppercase tracking-[0.3em] ml-2">Internal Title</label>
                                    <input
                                        type="text"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="e.g., QUANTUM DYNAMICS"
                                        className="w-full bg-white/[0.03] border-white/15 text-2xl font-black py-6 px-10 rounded-[2rem] focus:border-primary-500/50 focus:ring-[12px] focus:ring-primary-500/10 placeholder:text-dark-700 transition-all uppercase tracking-tight"
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-6">
                                    <label className="block text-[10px] font-black text-primary-400 uppercase tracking-[0.3em] ml-2">Visual Index Color</label>
                                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-4 px-2">
                                        {FOLDER_COLORS.map((color) => (
                                            <motion.button
                                                key={color}
                                                whileHover={{ scale: 1.1, y: -4 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => setNewFolderColor(color)}
                                                className={`aspect-square rounded-[1.2rem] transition-all relative overflow-hidden group shadow-xl ${newFolderColor === color ? 'ring-4 ring-white/30 scale-110' : 'border border-white/5'}`}
                                                style={{ backgroundColor: color }}
                                            >
                                                <div className={`absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-opacity ${newFolderColor === color ? 'opacity-100' : 'opacity-0'}`}>
                                                    <Check className="w-8 h-8 text-white stroke-[4]" />
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-6 mt-16 relative z-10">
                                <button onClick={() => setShowFolderModal(false)} className="px-10 py-5 rounded-[2rem] bg-white/5 hover:bg-white/10 text-dark-400 font-black text-[11px] uppercase tracking-[0.2em] border border-white/10 flex-1 transition-all">
                                    Discard
                                </button>
                                <motion.button
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleCreateFolder}
                                    className="px-10 py-5 rounded-[2rem] bg-gradient-to-r from-primary-500 to-rose-600 text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-[0_20px_40px_rgba(244,63,94,0.3)] flex-1 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                                    disabled={!newFolderName.trim()}
                                >
                                    Initialize Segment
                                </motion.button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default Documents;
