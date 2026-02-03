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
    FileCode
} from 'lucide-react';
import { Link } from 'react-router-dom';
import useDocumentStore from '../stores/useDocumentStore';
import Card from '../components/ui/Card';
import FileUpload from '../components/documents/FileUpload';

// Color options for folders
const FOLDER_COLORS = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#6366f1', '#84cc16'
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
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        fetchDocuments();
        fetchFolders();
    }, [fetchDocuments, fetchFolders]);

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
    const filteredDocs = documents.filter(doc => {
        const matchesFolder = selectedFolderId === null || doc.folder_id === selectedFolderId;
        const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (doc.category && doc.category.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesFolder && matchesSearch;
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
            {/* Sidebar */}
            <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6">
                <div className="glass-morphism rounded-3xl p-4 flex flex-col h-[500px] lg:h-[calc(100vh-12rem)] sticky top-6">
                    <div className="flex items-center justify-between mb-6 px-2 pt-2">
                        <h3 className="text-xs font-bold text-primary-300 uppercase tracking-[0.2em]">Folders</h3>
                        <button
                            onClick={() => setShowFolderModal(true)}
                            className="p-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-xl transition-all active:scale-90 border border-primary-500/20 group"
                            title="New Folder"
                        >
                            <FolderPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>

                    <div className="space-y-1.5 px-1 pb-4 border-b border-white/10">
                        {/* All Documents */}
                        <button
                            onClick={() => setSelectedFolder(null)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-300 ${selectedFolderId === null
                                ? 'bg-gradient-to-r from-primary-600/30 to-primary-500/10 text-white border border-primary-500/30 shadow-lg shadow-primary-950/20'
                                : 'hover:bg-white/5 text-dark-300'
                                }`}
                        >
                            <div className={`p-2 rounded-xl ${selectedFolderId === null ? 'bg-primary-500/20' : 'bg-white/5'}`}>
                                <Folder className="w-4 h-4" />
                            </div>
                            <span className="flex-1 font-semibold text-sm">All Documents</span>
                            <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded-lg opacity-60">{documents.length}</span>
                        </button>

                        {/* Unfiled */}
                        <button
                            onClick={() => setSelectedFolder('unfiled')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-300 ${selectedFolderId === 'unfiled'
                                ? 'bg-gradient-to-r from-primary-600/30 to-primary-500/10 text-white border border-primary-500/30 shadow-lg shadow-primary-950/20'
                                : 'hover:bg-white/5 text-dark-300'
                                }`}
                        >
                            <div className={`p-2 rounded-xl ${selectedFolderId === 'unfiled' ? 'bg-primary-500/20' : 'bg-white/5'}`}>
                                <FileText className="w-4 h-4" />
                            </div>
                            <span className="flex-1 font-semibold text-sm">Unfiled</span>
                            <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded-lg opacity-60">{unfiledCount}</span>
                        </button>
                    </div>

                    {/* Scrollable Folder List */}
                    <div className="flex-1 overflow-y-auto mt-4 px-1 space-y-1.5 custom-scrollbar pr-2">
                        {folders.length > 0 ? (
                            folders.map((folder) => (
                                <button
                                    key={folder.id}
                                    onClick={() => setSelectedFolder(folder.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-300 group ${selectedFolderId === folder.id
                                        ? 'bg-gradient-to-r from-primary-600/20 to-primary-500/5 text-white border border-primary-500/30 shadow-lg shadow-primary-950/20'
                                        : 'hover:bg-white/5 text-dark-300'
                                        }`}
                                >
                                    <div
                                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-white/5"
                                        style={{ backgroundColor: folder.color + '20' }}
                                    >
                                        <Folder className="w-3.5 h-3.5" style={{ color: folder.color }} />
                                    </div>
                                    <span className="flex-1 font-semibold text-sm truncate">{folder.name}</span>
                                    <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-lg opacity-40 group-hover:opacity-100 transition-opacity">
                                        {folder.document_count}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Are you sure you want to delete folder "${folder.name}"? Documents will be unfiled.`)) {
                                                deleteFolder(folder.id);
                                            }
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded-lg text-red-500 transition-all active:scale-90"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </button>
                            ))
                        ) : (
                            <div className="py-10 text-center space-y-2 opacity-30">
                                <FolderPlus className="w-8 h-8 mx-auto text-dark-500" />
                                <p className="text-xs font-medium">No custom folders</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-primary-400 uppercase tracking-widest">
                            <Link to="/documents" className="hover:text-primary-300 transition-colors">Library</Link>
                            <ChevronRight className="w-3 h-3 text-dark-600" />
                            <span className="text-dark-400">
                                {selectedFolderId === null ? 'All Documents' :
                                    selectedFolderId === 'unfiled' ? 'Unfiled' :
                                        folders.find(f => f.id === selectedFolderId)?.name || 'Folder'}
                            </span>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-sm">
                            {selectedFolderId === null ? 'Documents' :
                                selectedFolderId === 'unfiled' ? 'Unfiled Files' :
                                    folders.find(f => f.id === selectedFolderId)?.name}
                        </h1>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 text-dark-300 transition-all active:scale-95"
                        >
                            {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid3X3 className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => setIsUploadOpen(!isUploadOpen)}
                            className={`btn-primary px-6 py-3 rounded-2xl shadow-primary-500/20 shadow-xl ${isUploadOpen ? 'from-dark-700 to-dark-600 hover:from-dark-600' : ''}`}
                        >
                            {isUploadOpen ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            <span>{isUploadOpen ? 'Close' : 'Add Document'}</span>
                        </button>
                    </div>
                </div>

                {/* Upload Section */}
                {isUploadOpen && (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                        <Card title="Upload New Document" className="border-primary-500/20 shadow-primary-500/10 shadow-3xl bg-primary-500/5 backdrop-blur-xl">
                            <FileUpload
                                onComplete={() => {
                                    setIsUploadOpen(false);
                                    fetchDocuments();
                                }}
                                selectedFolderId={selectedFolderId !== 'unfiled' ? selectedFolderId : null}
                            />
                        </Card>
                    </div>
                )}

                {/* Toolbar */}
                <div className="relative group max-w-2xl">
                    <div className="absolute inset-0 bg-primary-500/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative glass-morphism rounded-2xl p-1 flex items-center border-white/10">
                        <div className="p-3 text-dark-500 group-focus-within:text-primary-400 transition-colors">
                            <Search className="w-5 h-5" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search your library..."
                            className="bg-transparent border-none focus:ring-0 w-full text-lg font-medium placeholder:text-dark-600"
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
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {filteredDocs.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="group relative glass-morphism rounded-[2.5rem] p-6 pt-8 transition-all duration-500 hover:translate-y-[-8px] hover:shadow-2xl hover:shadow-primary-950/40 border-white/5 hover:border-primary-500/30 overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 blur-[60px] group-hover:bg-primary-500/10 transition-colors -z-10" />

                                        <div className="flex items-start justify-between mb-8">
                                            <div className="p-4 rounded-[1.5rem] bg-gradient-to-br from-primary-600/20 to-primary-500/5 border border-primary-500/20 group-hover:border-primary-400/40 transition-all shadow-inner">
                                                {doc.file_type === 'pdf' ? (
                                                    <FileText className="w-8 h-8 text-primary-400 group-hover:scale-110 transition-transform" />
                                                ) : doc.file_type === 'link' ? (
                                                    <Globe className="w-8 h-8 text-primary-400 group-hover:scale-110 transition-transform" />
                                                ) : (doc.file_type === 'markdown' || doc.file_type === 'text') ? (
                                                    <FileCode className="w-8 h-8 text-primary-400 group-hover:scale-110 transition-transform" />
                                                ) : (
                                                    <ImageIcon className="w-8 h-8 text-primary-400 group-hover:scale-110 transition-transform" />
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
                                                    }}
                                                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-dark-500 hover:text-white transition-all border border-white/5 active:scale-90"
                                                >
                                                    <MoreVertical className="w-4.5 h-4.5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm("Delete this document?")) deleteDocument(doc.id);
                                                    }}
                                                    className="p-2.5 bg-white/5 hover:bg-red-500/20 rounded-xl text-dark-500 hover:text-red-400 transition-all border border-white/5 active:scale-90"
                                                >
                                                    <Trash2 className="w-4.5 h-4.5" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <h3 className="font-bold text-xl text-white leading-tight line-clamp-2 group-hover:text-primary-300 transition-colors min-h-[3.5rem]">
                                                {doc.title}
                                            </h3>
                                            <div className="flex flex-wrap gap-2 items-center">
                                                {doc.folder_id && folders.find(f => f.id === doc.folder_id) && (
                                                    <div
                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/5"
                                                        style={{ backgroundColor: (folders.find(f => f.id === doc.folder_id)?.color + '15'), color: folders.find(f => f.id === doc.folder_id)?.color }}
                                                    >
                                                        <Folder className="w-3 h-3" />
                                                        {folders.find(f => f.id === doc.folder_id)?.name}
                                                    </div>
                                                )}
                                                <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-dark-500 border border-white/5">
                                                    {doc.file_type}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between">
                                            {(doc.status === 'processing' || doc.status === 'pending' || doc.status === 'uploading') ? (
                                                <div className="flex flex-col gap-2 flex-1 max-w-[140px]">
                                                    <div className="flex justify-between items-center text-[10px] font-black tracking-tighter uppercase">
                                                        <span className={`animate-pulse ${doc.status === 'uploading' ? 'text-blue-400' : 'text-primary-400'}`}>
                                                            {doc.status === 'uploading' ? 'Uploading...' : 'Processing...'}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                        <div className={`h-full rounded-full w-full animate-indeterminate-bar ${doc.status === 'uploading' ? 'bg-blue-500/50' : 'bg-primary-500/50'}`} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2 flex-1 max-w-[140px]">
                                                    <div className="flex justify-between items-center text-[10px] font-black tracking-tighter uppercase">
                                                        <span className="text-dark-500">Progress</span>
                                                        <span className="text-primary-400">{Math.round((doc.reading_progress || 0) * 100)}%</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                                                            style={{ width: `${(doc.reading_progress || 0) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <Link
                                                to={doc.status === 'processing' || doc.status === 'pending' ? '#' : `/documents/${doc.id}`}
                                                className={`btn-primary py-3 px-6 rounded-2xl text-xs font-black uppercase tracking-[0.15em] flex items-center gap-2 group/btn shadow-lg ${(doc.status === 'processing' || doc.status === 'pending') ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                                            >
                                                <span>Study</span>
                                                <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredDocs.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="group flex items-center gap-6 p-5 rounded-[2rem] bg-white/5 border border-white/5 hover:border-primary-500/20 hover:bg-white/[0.07] transition-all duration-300"
                                    >
                                        <div className="p-4 rounded-2xl bg-gradient-to-br from-primary-600/10 to-primary-500/5 border border-white/5 shrink-0 shadow-inner">
                                            {doc.file_type === 'pdf' ? (
                                                <FileText className="w-6 h-6 text-primary-400" />
                                            ) : doc.file_type === 'link' ? (
                                                <Globe className="w-6 h-6 text-primary-400" />
                                            ) : (doc.file_type === 'markdown' || doc.file_type === 'text') ? (
                                                <FileCode className="w-6 h-6 text-primary-400" />
                                            ) : (
                                                <ImageIcon className="w-6 h-6 text-primary-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-lg text-white truncate group-hover:text-primary-300 transition-colors">{doc.title}</h3>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="flex items-center gap-3 w-40 shrink-0">
                                                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                                        <div
                                                            className="h-full bg-primary-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                                                            style={{ width: `${(doc.reading_progress || 0) * 100}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-dark-500">{Math.round((doc.reading_progress || 0) * 100)}%</span>
                                                </div>
                                                {doc.folder_id && folders.find(f => f.id === doc.folder_id) && (
                                                    <span
                                                        className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border border-white/5 flex items-center gap-2"
                                                        style={{ backgroundColor: folders.find(f => f.id === doc.folder_id)?.color + '15', color: folders.find(f => f.id === doc.folder_id)?.color }}
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: folders.find(f => f.id === doc.folder_id)?.color }} />
                                                        {folders.find(f => f.id === doc.folder_id)?.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {(doc.status === 'processing' || doc.status === 'pending' || doc.status === 'uploading') ? (
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 duration-300">
                                                <span className={`text-xs font-bold px-4 py-2 rounded-xl border ${doc.status === 'uploading' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-primary-400 bg-primary-500/10 border-primary-500/20 animate-pulse'}`}>
                                                    {doc.status === 'uploading' ? 'Uploading...' : 'Processing...'}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 duration-300">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
                                                    }}
                                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-dark-400 border border-white/5"
                                                >
                                                    <MoreVertical className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm("Delete document?")) deleteDocument(doc.id);
                                                    }}
                                                    className="p-3 bg-white/5 hover:bg-red-500/20 rounded-xl text-red-500 border border-white/5"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                                <Link
                                                    to={`/documents/${doc.id}`}
                                                    className="btn-primary ml-2 px-6 py-2 rounded-xl text-sm font-bold shadow-lg"
                                                >
                                                    Read
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-16 glass-morphism rounded-[3rem] border-2 border-dashed border-white/10 animate-in zoom-in duration-500">
                        <div className="relative inline-block mb-8">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center mx-auto">
                                <BookOpen className="w-16 h-16 text-primary-400" />
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/40">
                                <Plus className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        <h3 className="text-3xl font-black text-white mb-3">
                            {selectedFolderId && selectedFolderId !== 'unfiled'
                                ? "This folder is empty"
                                : "Start Your Study Journey"}
                        </h3>
                        <p className="text-dark-400 max-w-md mx-auto text-lg font-medium mb-10 px-6">
                            {selectedFolderId && selectedFolderId !== 'unfiled'
                                ? "Add documents to this folder to keep your study materials organized."
                                : "Upload PDFs, add web links, or paste text to create your personalized study library."}
                        </p>

                        {/* Feature highlights for new users */}
                        {!selectedFolderId && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-10 px-6">
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                    <FileText className="w-8 h-8 text-primary-400 mx-auto mb-2" />
                                    <p className="text-xs font-bold text-white">Upload PDFs</p>
                                    <p className="text-[10px] text-dark-500 mt-1">Research papers, textbooks, notes</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                    <Globe className="w-8 h-8 text-primary-400 mx-auto mb-2" />
                                    <p className="text-xs font-bold text-white">Add Web Links</p>
                                    <p className="text-[10px] text-dark-500 mt-1">ArXiv papers, articles, blogs</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                    <FileCode className="w-8 h-8 text-primary-400 mx-auto mb-2" />
                                    <p className="text-xs font-bold text-white">Paste Text</p>
                                    <p className="text-[10px] text-dark-500 mt-1">Markdown, plain text, notes</p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setIsUploadOpen(true)}
                            className="btn-primary mx-auto px-10 py-4 rounded-2xl text-lg font-black shadow-2xl shadow-primary-500/30 group"
                        >
                            <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                            Add Your First Document
                        </button>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-[60] cursor-default" onClick={() => setContextMenu(null)} />
                    <div
                        className="fixed z-[70] glass-morphism bg-dark-900 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 rounded-2xl py-3 min-w-[220px] animate-in fade-in zoom-in-95 duration-200"
                        style={{ left: Math.min(contextMenu.x, window.innerWidth - 240), top: contextMenu.y }}
                    >
                        <p className="px-5 py-2 text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mb-1">Organize</p>
                        <button
                            onClick={() => handleMoveToFolder(contextMenu.docId, null)}
                            className={`w-full px-5 py-3 text-left text-sm font-semibold hover:bg-white/5 flex items-center gap-3 transition-colors ${!documents.find(d => d.id === contextMenu.docId)?.folder_id ? 'text-primary-400' : 'text-dark-300'}`}
                        >
                            <FileText className="w-4 h-4 opacity-70" />
                            Move to Unfiled
                        </button>
                        <div className="my-2 border-t border-white/5" />
                        <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                            {folders.map((folder) => (
                                <button
                                    key={folder.id}
                                    onClick={() => handleMoveToFolder(contextMenu.docId, folder.id)}
                                    className={`w-full px-5 py-3 text-left text-sm font-semibold hover:bg-white/5 flex items-center gap-3 transition-colors ${documents.find(d => d.id === contextMenu.docId)?.folder_id === folder.id ? 'text-primary-400' : 'text-dark-300'}`}
                                >
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color }} />
                                    {folder.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* New Folder Modal */}
            {showFolderModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowFolderModal(false)}>
                    <div className="glass-morphism bg-dark-900 border border-white/10 rounded-[2.5rem] p-10 w-full max-w-lg shadow-[0_0_100px_rgba(0,0,0,0.7)] animate-in zoom-in-95 duration-500" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-10">
                            <div className="space-y-1">
                                <h2 className="text-3xl font-black text-white">New Folder</h2>
                                <p className="text-dark-500 text-sm font-medium">Categorize your study material</p>
                            </div>
                            <button onClick={() => setShowFolderModal(false)} className="p-3 hover:bg-white/5 rounded-2xl text-dark-500 transition-all active:rotate-90">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-3">
                                <label className="block text-xs font-black text-primary-400 uppercase tracking-widest ml-1">Name Your Collection</label>
                                <input
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="e.g., Organic Chemistry"
                                    className="w-full bg-white/5 border-white/10 text-xl font-bold py-4 px-6 rounded-2xl focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/10 placeholder:text-dark-700 transition-all"
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="block text-xs font-black text-primary-400 uppercase tracking-widest ml-1">Visual Identity</label>
                                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                                    {FOLDER_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => setNewFolderColor(color)}
                                            className={`aspect-square rounded-2xl transition-all relative overflow-hidden group ${newFolderColor === color ? 'ring-4 ring-white/20' : 'hover:scale-110'}`}
                                            style={{ backgroundColor: color }}
                                        >
                                            <div className={`absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity ${newFolderColor === color ? 'opacity-100' : 'opacity-0'}`}>
                                                <Check className="w-6 h-6 text-white" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-12">
                            <button onClick={() => setShowFolderModal(false)} className="btn-secondary flex-1 py-4 text-sm font-bold uppercase tracking-widest">
                                Discard
                            </button>
                            <button
                                onClick={handleCreateFolder}
                                className="btn-primary flex-1 py-4 text-sm font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary-500/20"
                                disabled={!newFolderName.trim()}
                            >
                                Create Folder
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Documents;
