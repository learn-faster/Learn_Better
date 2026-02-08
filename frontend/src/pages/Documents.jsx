import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  ImageIcon,
  Folder,
  MoreVertical,
  Grid3X3,
  List,
  X,
  Globe,
  FileCode,
  Network,
  RotateCcw,
  Pencil
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FileUpload from '../components/documents/FileUpload';
import useDocumentStore from '../stores/useDocumentStore';
import cognitiveService from '../services/cognitive';

const STATUS_STYLES = {
  uploading: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  processing: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
  pending: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
  ingesting: 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30',
  extracted: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  complete: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-200 border border-rose-500/30'
};

const FOLDER_COLORS = [
  '#F43F5E', '#06B6D4', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#6366F1', '#94A3B8'
];

const EMBEDDING_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'together', label: 'Together' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'huggingface', label: 'Hugging Face' },
  { value: 'custom', label: 'OpenAI-Compatible' }
];

const Documents = () => {
    const {
        documents,
        folders,
        selectedFolderId,
        isLoading,
        fetchDocuments,
    fetchFolders,
    updateDocument,
    deleteDocument,
        createFolder,
        setSelectedFolder,
        moveToFolder,
        synthesizeDocument,
        reprocessDocument
  } = useDocumentStore();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('date');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [contextMenu, setContextMenu] = useState(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [embeddingSettings, setEmbeddingSettings] = useState({
    embedding_provider: 'ollama',
    embedding_model: 'embeddinggemma:latest',
    embedding_api_key: '',
    embedding_base_url: 'http://localhost:11434'
  });

  useEffect(() => {
    fetchDocuments();
    fetchFolders();
  }, [fetchDocuments, fetchFolders]);

  useEffect(() => {
    if (isUploadOpen || showFolderModal || showSettingsModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isUploadOpen, showFolderModal, showSettingsModal]);

  useEffect(() => {
    const hasProcessingDocs = documents.some(d => ['processing', 'pending', 'ingesting', 'uploading'].includes(d.status));
    let interval;
    if (hasProcessingDocs) {
      interval = setInterval(() => {
        fetchDocuments(true);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [documents, fetchDocuments]);

  const loadEmbeddingSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await cognitiveService.getSettings();
      setEmbeddingSettings((prev) => ({
        ...prev,
        embedding_provider: data?.embedding_provider || prev.embedding_provider,
        embedding_model: data?.embedding_model || prev.embedding_model,
        embedding_api_key: data?.embedding_api_key || prev.embedding_api_key,
        embedding_base_url: data?.embedding_base_url || prev.embedding_base_url
      }));
    } catch (err) {
      setSettingsError('Failed to load embedding settings.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveEmbeddingSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await cognitiveService.updateSettings({
        embedding_provider: embeddingSettings.embedding_provider,
        embedding_model: embeddingSettings.embedding_model,
        embedding_api_key: embeddingSettings.embedding_api_key,
        embedding_base_url: embeddingSettings.embedding_base_url
      });
      setShowSettingsModal(false);
    } catch (err) {
      setSettingsError('Unable to save settings. Please try again.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder({ name: newFolderName, color: newFolderColor });
      setNewFolderName('');
      setNewFolderColor(FOLDER_COLORS[0]);
      setShowFolderModal(false);
    } catch (err) {
      setSettingsError('Failed to create folder.');
    }
  };

  const handleMoveToFolder = async (docId, folderId) => {
    await moveToFolder(docId, folderId);
    setContextMenu(null);
  };

  const filteredDocs = documents
    .filter(doc => {
      const matchesFolder = selectedFolderId === null ||
        (selectedFolderId === 'unfiled' ? !doc.folder_id : doc.folder_id === selectedFolderId);
      const title = (doc.title || doc.filename || '').toLowerCase();
      const category = (doc.category || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      return matchesFolder && (title.includes(query) || category.includes(query));
    })
    .sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'progress') return (b.reading_progress || 0) - (a.reading_progress || 0);
      return new Date(b.created_at || b.upload_date) - new Date(a.created_at || a.upload_date);
    });

  const unfiledCount = documents.filter(d => !d.folder_id).length;

  const activeFolderName = selectedFolderId === null
    ? 'All Documents'
    : selectedFolderId === 'unfiled'
      ? 'Unfiled'
      : folders.find(f => f.id === selectedFolderId)?.name || 'Folder';

  const handleSynthesize = async (docId) => {
    await synthesizeDocument(docId);
  };

  const handleReprocess = async (docId) => {
    await reprocessDocument(docId);
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    await deleteDocument(docId);
  };

  const handleRename = async (doc) => {
    const current = doc.title || doc.filename || '';
    const next = window.prompt('Rename document', current);
    if (!next || next.trim() === current) return;
    await updateDocument(doc.id, { title: next.trim() });
  };

  const showBaseUrl = ['openrouter', 'together', 'fireworks', 'mistral', 'deepseek', 'perplexity', 'huggingface', 'custom', 'ollama'].includes(embeddingSettings.embedding_provider);
  const showApiKey = embeddingSettings.embedding_provider !== 'ollama';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 min-h-[calc(100vh-6rem)]">
      <aside className="space-y-4">
        <div className="rounded-2xl bg-dark-900/60 border border-white/10 p-4 sticky top-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-white">Folders</p>
              <p className="text-[11px] text-dark-400">Organize your sources.</p>
            </div>
            <button
              onClick={() => setShowFolderModal(true)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-primary-300 border border-white/10"
              title="Create folder"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${selectedFolderId === null ? 'bg-primary-500/15 text-white border border-primary-500/30' : 'text-dark-300 hover:bg-white/5'}`}
            >
              <span className="flex items-center gap-2"><Folder className="w-4 h-4" /> All Documents</span>
              <span className="text-[10px] text-dark-400">{documents.length}</span>
            </button>
            <button
              onClick={() => setSelectedFolder('unfiled')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${selectedFolderId === 'unfiled' ? 'bg-primary-500/15 text-white border border-primary-500/30' : 'text-dark-300 hover:bg-white/5'}`}
            >
              <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> Unfiled</span>
              <span className="text-[10px] text-dark-400">{unfiledCount}</span>
            </button>
          </div>

          <div className="mt-4 border-t border-white/5 pt-4 space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${selectedFolderId === folder.id ? 'bg-white/10 text-white border border-white/10' : 'text-dark-300 hover:bg-white/5'}`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: folder.color }} />
                  <span className="truncate">{folder.name}</span>
                </span>
                <span className="text-[10px] text-dark-400">{folder.document_count}</span>
              </button>
            ))}
            {folders.length === 0 && (
              <div className="text-[11px] text-dark-500 py-4 text-center">No folders yet.</div>
            )}
          </div>
        </div>
      </aside>

      <main className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">{activeFolderName}</h1>
            <p className="text-sm text-dark-400">Upload, review, and process your learning materials.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => { setShowSettingsModal(true); loadEmbeddingSettings(); }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-dark-200 border border-white/10 text-sm"
            >
              Processing settings
            </button>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold"
            >
              Upload
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-dark-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
          >
            <option value="date">Most recent</option>
            <option value="title">Title</option>
            <option value="progress">Progress</option>
          </select>
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isUploadOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-950/80 backdrop-blur" onClick={() => setIsUploadOpen(false)}>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-dark-900 border border-white/10 rounded-2xl p-6 w-full max-w-3xl shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Upload a document</h2>
                    <p className="text-xs text-dark-400">PDF, images, or links.</p>
                  </div>
                  <button onClick={() => setIsUploadOpen(false)} className="p-2 rounded-lg hover:bg-white/5 text-dark-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <FileUpload onClose={() => setIsUploadOpen(false)} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="py-20 text-center text-dark-400">Loading documents...</div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-20 text-center text-dark-400">No documents found.</div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
            {filteredDocs.map((doc) => {
              const statusKey = doc.status || 'complete';
              const statusClass = STATUS_STYLES[statusKey] || STATUS_STYLES.complete;
              const iconType = doc.file_type?.toLowerCase();
              const title = doc.title || doc.filename || `Document ${doc.id}`;
              return (
                <div
                  key={doc.id}
                  className={`rounded-2xl border border-white/10 bg-dark-900/60 p-4 hover:border-primary-500/30 transition ${viewMode === 'list' ? 'flex items-center gap-4' : 'space-y-3'}`}
                >
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-dark-950 border border-white/5 flex items-center justify-center">
                    {(iconType === 'pdf' || (doc.filename && doc.filename.toLowerCase().endsWith('.pdf'))) ? (
                      <FileText className="w-5 h-5 text-primary-400" />
                    ) : iconType === 'link' ? (
                      <Globe className="w-5 h-5 text-cyan-400" />
                    ) : (iconType === 'markdown' || iconType === 'text') ? (
                      <FileCode className="w-5 h-5 text-amber-400" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-fuchsia-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
                      <span className={`text-[10px] px-2 py-1 rounded-full ${statusClass}`}>{doc.status || 'ready'}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-dark-400">
                      <span>{doc.file_type || 'file'}</span>
                      {doc.reading_progress !== null && (
                        <span>{Math.round((doc.reading_progress || 0) * 100)}% read</span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 bg-dark-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500"
                        style={{ width: `${Math.max(5, (doc.reading_progress || 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.status === 'failed' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReprocess(doc.id); }}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-amber-300"
                        title="Retry extraction"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {doc.status === 'extracted' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSynthesize(doc.id); }}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300"
                        title="Synthesize graph"
                      >
                        <Network className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY }); }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-dark-300"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300"
                      title="Delete document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/documents/${doc.id}`}
                      className="px-3 py-2 rounded-lg bg-primary-500 text-white text-xs font-semibold"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[60] cursor-default" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[70] bg-dark-900 shadow-2xl border border-white/10 rounded-2xl py-3 min-w-[240px] animate-in fade-in zoom-in-95 duration-200"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 260), top: Math.min(contextMenu.y, window.innerHeight - 400) }}
          >
            <p className="px-4 py-2 text-[10px] font-semibold text-dark-400 uppercase tracking-widest">Move to folder</p>
            <button
              onClick={() => handleMoveToFolder(contextMenu.docId, null)}
              className={`w-full px-4 py-3 text-left text-xs hover:bg-white/5 flex items-center gap-3 ${!documents.find(d => d.id === contextMenu.docId)?.folder_id ? 'text-primary-300 bg-white/5' : 'text-dark-300'}`}
            >
              <FileText className="w-4 h-4" /> Unfiled
            </button>
            <div className="my-2 border-t border-white/5 mx-3" />
            <div className="max-h-[260px] overflow-y-auto custom-scrollbar px-2 space-y-1">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveToFolder(contextMenu.docId, folder.id)}
                  className={`w-full px-3 py-2 rounded-xl text-left text-xs hover:bg-white/5 flex items-center gap-3 ${documents.find(d => d.id === contextMenu.docId)?.folder_id === folder.id ? 'text-primary-300 bg-white/5' : 'text-dark-300'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: folder.color }} />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showFolderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-950/80 backdrop-blur-sm" onClick={() => setShowFolderModal(false)}>
          <div className="bg-dark-900 border border-white/10 rounded-2xl p-6 w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">New folder</h2>
                <p className="text-xs text-dark-400">Group related documents.</p>
              </div>
              <button onClick={() => setShowFolderModal(false)} className="p-2 rounded-lg hover:bg-white/5 text-dark-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-dark-400">Folder name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
                  placeholder="e.g. Biology"
                />
              </div>
              <div>
                <label className="text-xs text-dark-400">Color</label>
                <div className="mt-2 grid grid-cols-8 gap-2">
                  {FOLDER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewFolderColor(color)}
                      className={`w-7 h-7 rounded-lg border ${newFolderColor === color ? 'border-white' : 'border-white/10'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={() => setShowFolderModal(false)} className="px-3 py-2 rounded-lg text-sm text-dark-300 hover:text-white">Cancel</button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-950/80 backdrop-blur" onClick={() => setShowSettingsModal(false)}>
          <div className="bg-dark-900 border border-white/10 rounded-2xl p-6 w-full max-w-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Processing settings</h2>
                <p className="text-xs text-dark-400">Configure embedding provider and model for ingestion.</p>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 rounded-lg hover:bg-white/5 text-dark-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {settingsError && <div className="text-xs text-rose-300 mb-3">{settingsError}</div>}
            {settingsLoading ? (
              <div className="text-sm text-dark-400">Loading settings...</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-dark-400">Embedding provider</label>
                  <select
                    value={embeddingSettings.embedding_provider}
                    onChange={(e) => setEmbeddingSettings((prev) => ({ ...prev, embedding_provider: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
                  >
                    {EMBEDDING_PROVIDERS.map((provider) => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-dark-400">Embedding model</label>
                  <input
                    value={embeddingSettings.embedding_model}
                    onChange={(e) => setEmbeddingSettings((prev) => ({ ...prev, embedding_model: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
                  />
                </div>
                {showApiKey && (
                  <div>
                    <label className="text-xs text-dark-400">API key</label>
                    <input
                      type="password"
                      value={embeddingSettings.embedding_api_key}
                      onChange={(e) => setEmbeddingSettings((prev) => ({ ...prev, embedding_api_key: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
                    />
                  </div>
                )}
                {showBaseUrl && (
                  <div>
                    <label className="text-xs text-dark-400">Base URL</label>
                    <input
                      value={embeddingSettings.embedding_base_url}
                      onChange={(e) => setEmbeddingSettings((prev) => ({ ...prev, embedding_base_url: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white"
                    />
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button onClick={() => setShowSettingsModal(false)} className="px-3 py-2 rounded-lg text-sm text-dark-300 hover:text-white">Cancel</button>
                  <button
                    onClick={handleSaveEmbeddingSettings}
                    disabled={settingsSaving}
                    className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {settingsSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRename(doc); }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-dark-200"
                      title="Rename"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
