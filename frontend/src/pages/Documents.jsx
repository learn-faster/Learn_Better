import React, { useEffect, useRef, useState } from 'react';
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
  Pencil
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import FileUpload from '../components/documents/FileUpload';
import useDocumentStore from '../stores/useDocumentStore';
import useFolderStore from '../stores/useFolderStore';
import cognitiveService from '../services/cognitive';
import aiSettings from '../services/aiSettings';
import InlineErrorBanner from '../components/common/InlineErrorBanner';
import { getApiUrl, getConfig, resetConfig } from '../lib/config';

const STATUS_STYLES = {
  uploading: 'bg-primary-500/15 text-primary-200 border border-primary-500/30',
  processing: 'bg-primary-400/15 text-primary-200 border border-primary-400/30',
  pending: 'bg-primary-400/15 text-primary-200 border border-primary-400/30',
  ingesting: 'bg-primary-500/15 text-primary-200 border border-primary-500/30',
  extracted: 'bg-primary-300/15 text-primary-200 border border-primary-300/30',
  complete: 'bg-primary-300/15 text-primary-200 border border-primary-300/30',
  completed: 'bg-primary-300/15 text-primary-200 border border-primary-300/30',
  failed: 'bg-rose-500/15 text-rose-200 border border-rose-500/30',
  rate_limited: 'bg-primary-500/15 text-primary-200 border border-primary-500/30',
  paused: 'bg-primary-500/15 text-primary-200 border border-primary-500/30'
};

const FOLDER_COLORS = [
  '#c2efb3', '#dcd6f7', '#2ec4b6', '#b5efe2',
  '#7fe3d2', '#49d6c2', '#e8e5f2', '#8f8aa0'
];

const Documents = () => {
  const navigate = useNavigate();
  const {
    documents,
    isLoading,
    error,
    fetchDocuments,
    updateDocument,
    deleteDocument,
    moveToFolder,
    synthesizeDocument,
    reprocessDocument,
    setDocumentsFromSocket
  } = useDocumentStore();

  const {
    folders,
    selectedFolderId,
    fetchFolders,
    createFolder,
    setSelectedFolder
  } = useFolderStore();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('date');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [contextMenu, setContextMenu] = useState(null);

  const [folderError, setFolderError] = useState(null);
  const [llmStatus, setLlmStatus] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [llmDisplay, setLlmDisplay] = useState({ provider: null, model: null });
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [embeddingHealth, setEmbeddingHealth] = useState(null);
  const [embeddingHealthLoading, setEmbeddingHealthLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);
  const [queueWorkers, setQueueWorkers] = useState(null);
  const [queueTesting, setQueueTesting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [embeddingSettings, setEmbeddingSettings] = useState({
    embedding_provider: 'ollama',
    embedding_model: 'embeddinggemma:latest',
    embedding_api_key: '',
    embedding_base_url: 'http://localhost:11434',
    embedding_dimensions: 768
  });
  const [progressDisplay, setProgressDisplay] = useState({});
  const progressTrackerRef = useRef(new Map());

  useEffect(() => {
    fetchDocuments(false, { force: true });
    fetchFolders();
  }, [fetchDocuments, fetchFolders]);

  useEffect(() => {
    let ws;
    let reconnectTimer;
    const buildWsUrl = (baseUrl) => {
      if (!baseUrl) {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${window.location.host}/api/documents/ws`;
      }
      try {
        const url = new URL(baseUrl);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${url.host}/api/documents/ws`;
      } catch {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${window.location.host}/api/documents/ws`;
      }
    };
    const connect = async () => {
      let apiUrl = '';
      try {
        apiUrl = await getApiUrl();
      } catch {
        apiUrl = '';
      }
      const wsUrl = buildWsUrl(apiUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data?.documents)) {
            setDocumentsFromSocket(data.documents);
          }
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    const handleScroll = () => setContextMenu(null);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [setDocumentsFromSocket]);

  useEffect(() => {
    const map = progressTrackerRef.current;
    const now = Date.now();
    documents.forEach((doc) => {
      const progress = Number(doc.progress_percent ?? doc.ingestion_progress ?? 0);
      const existing = map.get(doc.id);
      if (!existing) {
        map.set(doc.id, { progress, changedAt: now, prevProgress: progress, prevChangedAt: now });
      } else if (existing.progress !== progress) {
        map.set(doc.id, {
          progress,
          changedAt: now,
          prevProgress: existing.progress,
          prevChangedAt: existing.changedAt
        });
      }
    });
  }, [documents]);

  useEffect(() => {
    let interval;
    const tick = () => {
      setProgressDisplay((prev) => {
        let changed = false;
        const next = { ...prev };
        documents.forEach((doc) => {
          const statusKey = doc.status || 'complete';
          const isProcessing = ['processing', 'pending', 'ingesting', 'uploading'].includes(statusKey);
          const ingestionProgress = Math.max(0, Math.min(100, Number(doc.progress_percent ?? doc.ingestion_progress ?? 0)));
          const readingProgress = Math.max(0, Math.min(100, Math.round((doc.reading_progress || 0) * 100)));
          const target = isProcessing ? ingestionProgress : readingProgress;
          const current = prev[doc.id] ?? target;
          let updated = current;
          if (isProcessing && current < target) {
            updated = Math.min(target, current + 1);
          } else if (!isProcessing) {
            updated = target;
          }
          if (prev[doc.id] === undefined || updated !== current) {
            next[doc.id] = updated;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    tick();
    interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [documents]);

  useEffect(() => {
    checkEmbeddingHealth();
    loadAiSettings();
    loadLlmStatus();
  }, []);

  useEffect(() => {
    const loadQueueStatus = async () => {
      try {
        const cfg = await getConfig();
        setQueueStatus(cfg?.queueStatus || null);
        setQueueWorkers(typeof cfg?.queueWorkers === 'number' ? cfg.queueWorkers : null);
      } catch {
        setQueueStatus('disconnected');
        setQueueWorkers(null);
      }
    };
    loadQueueStatus();
  }, []);

  const refreshQueueStatus = async () => {
    setQueueTesting(true);
    try {
      resetConfig();
      const cfg = await getConfig();
      setQueueStatus(cfg?.queueStatus || null);
      setQueueWorkers(typeof cfg?.queueWorkers === 'number' ? cfg.queueWorkers : null);
      if (cfg?.queueStatus === 'connected') {
        toast.success('Queue connected');
      } else if (cfg?.queueStatus === 'no_workers') {
        toast.info('Queue has no workers (running locally).');
      } else if (cfg?.queueStatus === 'disabled') {
        toast.info('Queue disabled (local processing)');
      } else {
        toast.error('Queue disconnected');
      }
    } catch (err) {
      setQueueStatus('disconnected');
      setQueueWorkers(null);
      toast.error(err?.userMessage || err?.message || 'Failed to test queue connection.');
    } finally {
      setQueueTesting(false);
    }
  };

  useEffect(() => {
    if (isUploadOpen || showFolderModal || deleteModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isUploadOpen, showFolderModal, deleteModal]);

  useEffect(() => {
    if (wsConnected) return;
    const hasProcessingDocs = documents.some(d => ['processing', 'pending', 'ingesting', 'uploading'].includes(d.status));
    let interval;
    let isActive = true;

    const tick = () => {
      if (!isActive || document.visibilityState !== 'visible') return;
      fetchDocuments(true, { minIntervalMs: hasProcessingDocs ? 8000 : 15000 });
    };

    if (hasProcessingDocs) {
      interval = setInterval(tick, 6000);
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [documents, fetchDocuments, wsConnected]);

  useEffect(() => {
    const hasProcessingDocs = documents.some(d => ['processing', 'pending', 'ingesting', 'uploading'].includes(d.status));
    if (!hasProcessingDocs) return;
    const interval = setInterval(() => {
      fetchDocuments(true, { minIntervalMs: 5000 });
    }, 6000);
    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  const loadLlmStatus = async () => {
    setLlmLoading(true);
    setLlmError(null);
    try {
      const status = await cognitiveService.checkLlmHealth();
      setLlmStatus(status);
    } catch (err) {
      setLlmStatus(null);
      setLlmError(err?.userMessage || err?.message || 'Unable to check LLM status');
    } finally {
      setLlmLoading(false);
    }
  };

  const loadAiSettings = async () => {
    try {
      const data = await aiSettings.get();
      const embeddingConfig = data?.embeddings || data?.llm?.embedding_config || {};
      const globalConfig = data?.llm?.global || {};
      setEmbeddingSettings((prev) => ({
        ...prev,
        embedding_provider: embeddingConfig?.provider || prev.embedding_provider,
        embedding_model: embeddingConfig?.model || prev.embedding_model,
        embedding_api_key: embeddingConfig?.api_key || prev.embedding_api_key,
        embedding_base_url: embeddingConfig?.base_url || prev.embedding_base_url,
        embedding_dimensions: embeddingConfig?.dimensions || prev.embedding_dimensions
      }));
      setLlmDisplay({
        provider: globalConfig?.provider || null,
        model: globalConfig?.model || null
      });
    } catch {
      // Silent: status card still renders and can be checked.
    }
  };

  const checkEmbeddingHealth = async () => {
    setEmbeddingHealthLoading(true);
    try {
      const status = await cognitiveService.checkEmbeddingHealth();
      setEmbeddingHealth(status);
    } catch (err) {
      setEmbeddingHealth({
        ok: false,
        detail: err?.userMessage || err?.message || 'Failed to check connection.'
      });
    } finally {
      setEmbeddingHealthLoading(false);
    }
  };



  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder({ name: newFolderName, color: newFolderColor });
      setNewFolderName('');
      setNewFolderColor(FOLDER_COLORS[0]);
      setShowFolderModal(false);
      setFolderError(null);
    } catch (err) {
      setFolderError(err?.userMessage || err?.message || 'Failed to create folder.');
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
      const getTime = (value) => {
        if (!value) return 0;
        const t = Date.parse(value);
        return Number.isNaN(t) ? 0 : t;
      };
      return getTime(b.created_at || b.upload_date) - getTime(a.created_at || a.upload_date);
    });

  const unfiledCount = documents.filter(d => !d.folder_id).length;

  const activeFolderName = selectedFolderId === null
    ? 'All Documents'
    : selectedFolderId === 'unfiled'
      ? 'Unfiled'
      : folders.find(f => f.id === selectedFolderId)?.name || 'Folder';

  const handleSynthesize = async (docId, options = {}) => {
    try {
      await synthesizeDocument(docId, options);
      toast.success('Processing queued');
    } catch (err) {
      toast.error(err?.userMessage || err?.message || 'Failed to start processing');
    }
  };

  const handleReprocess = async (docId) => {
    try {
      await reprocessDocument(docId);
      toast.success('Reprocessing queued');
    } catch (err) {
      toast.error(err?.userMessage || err?.message || 'Failed to start reprocessing');
    }
  };

  const handleDelete = async (docId) => {
    const doc = documents.find((item) => item.id === docId);
    setDeleteError(null);
    setDeleteModal({
      id: docId,
      title: doc?.title || doc?.filename || `Document ${docId}`
    });
  };

  const handleConfirmDelete = async (removeGraphLinks) => {
    if (!deleteModal?.id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteDocument(deleteModal.id, { removeGraphLinks });
      setDeleteModal(null);
    } catch (err) {
      setDeleteError(err?.userMessage || err?.message || 'Failed to delete document.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRename = async (doc) => {
    const current = doc.title || doc.filename || '';
    const next = window.prompt('Rename document', current);
    if (!next || next.trim() === current) return;
    try {
      await updateDocument(doc.id, { title: next.trim() });
    } catch (err) {
      toast.error(err?.userMessage || err?.message || 'Failed to rename document.');
    }
  };

  const llmConfigured = Boolean(llmStatus?.ok);
  const llmProviderLabel = llmDisplay.provider || llmStatus?.provider || 'Not set';
  const llmModelLabel = llmDisplay.model || llmStatus?.model || 'Not set';

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
        <InlineErrorBanner message={error?.userMessage || error?.message || (error ? 'Failed to load documents.' : '')} />
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">{activeFolderName}</h1>
            <p className="text-sm text-dark-400">Upload, review, and process your learning materials.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-white text-sm font-semibold"
            >
              Upload
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-primary-500/20 bg-dark-900/70 p-4 md:p-5 shadow-[0_0_24px_rgba(46,196,182,0.12)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-primary-300 font-black">Processing Readiness</p>
              <p className="text-sm text-primary-100/80 mt-2 max-w-2xl">
                Upload files or URLs. If auto-process is off, use Process to extract content.
                Advanced rewriting requires an LLM.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`rounded-xl border px-3 py-3 text-xs ${embeddingHealth?.ok ? 'bg-primary-500/10 text-primary-200 border-primary-500/30' : 'bg-rose-500/10 text-rose-200 border-rose-500/30'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-widest text-[10px]">Embeddings</span>
                <button
                  onClick={checkEmbeddingHealth}
                  disabled={embeddingHealthLoading}
                  className="text-[10px] uppercase tracking-widest text-primary-200/80 hover:text-primary-100 disabled:opacity-60"
                >
                  {embeddingHealthLoading ? 'Checking...' : 'Check'}
                </button>
              </div>
              <div className="mt-2">
                {embeddingHealthLoading ? 'Checking connection...' : (embeddingHealth?.ok ? 'Connected' : 'Not connected')}
              </div>
              <div className="mt-2 text-[10px] text-primary-100/80">
                Provider: {embeddingSettings.embedding_provider || 'Not set'}
              </div>
              <div className="text-[10px] text-primary-100/80">
                Model: {embeddingSettings.embedding_model || 'Not set'}
              </div>
              <div className="text-[10px] text-primary-100/80">
                Dim: {embeddingSettings.embedding_dimensions || 'Not set'}
              </div>
            </div>
            <div className={`rounded-xl border px-3 py-3 text-xs ${llmConfigured ? 'bg-primary-500/10 text-primary-200 border-primary-500/30' : 'bg-rose-500/10 text-rose-200 border-rose-500/30'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-widest text-[10px]">LLM</span>
                <button
                  onClick={loadLlmStatus}
                  disabled={llmLoading}
                  className="text-[10px] uppercase tracking-widest text-primary-200/80 hover:text-primary-100 disabled:opacity-60"
                >
                  {llmLoading ? 'Checking...' : 'Check'}
                </button>
              </div>
              <div className="mt-2">
                {llmLoading ? 'Checking connection...' : llmConfigured ? `Connected (${llmProviderLabel})` : 'Not connected'}
                {llmError && <div className="mt-1 text-[10px] text-rose-200/80">{llmError}</div>}
                {!llmConfigured && llmStatus?.detail && (
                  <div className="mt-1 text-[10px] text-rose-200/80">{llmStatus.detail}</div>
                )}
              </div>
              <div className="mt-2 text-[10px] text-primary-100/80">
                Provider: {llmProviderLabel}
              </div>
              <div className="text-[10px] text-primary-100/80">
                Model: {llmModelLabel}
              </div>
            </div>
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
                <FileUpload onComplete={() => setIsUploadOpen(false)} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {isLoading && documents.length === 0 ? (
          <div className="py-20 text-center text-dark-400">Loading documents...</div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-20 text-center text-dark-400">No documents found.</div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
            {filteredDocs.map((doc) => {
              const statusKey = doc.status || 'complete';
              const statusClass = STATUS_STYLES[statusKey] || STATUS_STYLES.complete;
              let iconType = (doc.display_type || doc.file_type || '').toLowerCase();
              if (!iconType && doc.filename) {
                const name = doc.filename.toLowerCase();
                if (name.endsWith('.pdf')) iconType = 'pdf';
                else if (name.endsWith('.md') || name.endsWith('.markdown')) iconType = 'markdown';
                else if (name.endsWith('.txt') || name.endsWith('.text')) iconType = 'text';
                else if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.gif') || name.endsWith('.webp')) iconType = 'image';
                else if (name.endsWith('.mp4') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm') || name.endsWith('.mkv')) iconType = 'video';
              }
              const title = doc.title || doc.filename || `Document ${doc.id}`;
              const isProcessing = ['processing', 'pending', 'ingesting', 'uploading'].includes(statusKey);
              const canIngest = ['extracted', 'completed', 'failed'].includes(statusKey);
              const ingestionProgress = Math.max(0, Math.min(100, Number(doc.progress_percent ?? doc.ingestion_progress ?? 0)));
              const readingProgress = Math.max(0, Math.min(100, Math.round((doc.reading_progress || 0) * 100)));
              const displayProgress = isProcessing ? ingestionProgress : readingProgress;
              const smoothProgress = progressDisplay[doc.id] ?? displayProgress;
              const phase = (doc.ingestion_step || '').toLowerCase();
              const jobMessage = doc.ingestion_job_message;
              const jobStatus = doc.ingestion_job_status;
              const isRateLimited = phase === 'rate_limited'
                || jobStatus === 'paused'
                || (jobMessage && jobMessage.toLowerCase().includes('rate limit'));
              const phaseLabel = phase ? phase.replace(/_/g, ' ') : '';
              const phaseFriendlyMap = {
                queued: 'Queued for processing',
                queued_extraction: 'Queued for extraction',
                extracting: 'Scanning content',
                filtering: 'Cleaning text',
                ocr: 'Running OCR',
                ingesting: 'Building knowledge graph',
                ready_for_synthesis: 'Ready for graph build',
                initializing: 'Starting ingestion',
                complete: 'Complete'
              };
              const phaseFriendly = phaseFriendlyMap[phase] || (phaseLabel ? `Working: ${phaseLabel}` : '');
                const messageLabel = jobMessage && (!phaseLabel || !jobMessage.toLowerCase().includes(phaseLabel))
                  ? jobMessage
                  : '';
                const recommendation = doc.processing_recommendation;
                const showRecommendation = Boolean(recommendation?.is_large_source);
              let queueState = isProcessing
                ? (phase.includes('queued') || statusKey === 'pending' ? 'queued' : (phase === 'initializing' ? 'starting' : 'running'))
                : null;
              if (queueStatus !== 'connected' && queueState === 'queued') {
                queueState = null;
              }
              if (queueState === 'running') {
                queueState = null;
              }
              const showRetryExtract = ['processing', 'pending', 'ingesting'].includes(statusKey) && !isRateLimited;
              const showRetryIngest = statusKey === 'extracted' && !isRateLimited;
              const showQueueHint = isProcessing && displayProgress === 0 && queueState === 'queued' && queueStatus === 'connected';
              const normalizeJobTime = (value) => {
                if (!value) return null;
                if (value instanceof Date) return value;
                if (typeof value === 'string') {
                  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(value);
                  return new Date(hasTimezone ? value : `${value}Z`);
                }
                return new Date(value);
              };
              const lastUpdate = normalizeJobTime(doc.ingestion_job_updated_at);
              const lastUpdateMinutes = lastUpdate ? Math.max(0, Math.floor((Date.now() - lastUpdate.getTime()) / 60000)) : null;
              const progressEntry = progressTrackerRef.current.get(doc.id);
              const progressAgeMinutes = progressEntry ? Math.max(0, Math.floor((Date.now() - progressEntry.changedAt) / 60000)) : null;
              const progressAgeSeconds = progressEntry ? Math.max(0, Math.floor((Date.now() - progressEntry.changedAt) / 1000)) : null;
              const isStalled = !isRateLimited && isProcessing && lastUpdateMinutes !== null && progressAgeMinutes !== null && lastUpdateMinutes >= 5 && progressAgeMinutes >= 5;
              const prevProgress = progressEntry?.prevProgress ?? null;
              const prevChangedAt = progressEntry?.prevChangedAt ?? null;
              let etaMinutes = null;
              if (isProcessing && prevProgress !== null && prevChangedAt && ingestionProgress > prevProgress) {
                const deltaProgress = ingestionProgress - prevProgress;
                const deltaMinutes = Math.max(1, (Date.now() - prevChangedAt) / 60000);
                const rate = deltaProgress / deltaMinutes;
                if (rate > 0 && ingestionProgress > 1 && ingestionProgress < 99) {
                  etaMinutes = Math.ceil((100 - ingestionProgress) / rate);
                }
              }
              return (
                <div
                  key={doc.id}
                  className={`rounded-2xl border border-white/10 bg-dark-900/60 p-4 hover:border-primary-500/30 transition ${viewMode === 'list' ? 'flex flex-col md:flex-row md:items-center gap-4' : 'space-y-3'}`}
                >
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-dark-950 border border-white/5 flex items-center justify-center">
                    {(iconType === 'pdf' || (doc.filename && doc.filename.toLowerCase().endsWith('.pdf'))) ? (
                      <FileText className="w-5 h-5 text-primary-400" />
                    ) : iconType === 'link' ? (
                      <Globe className="w-5 h-5 text-primary-300" />
                    ) : (iconType === 'markdown' || iconType === 'text') ? (
                      <FileCode className="w-5 h-5 text-primary-300" />
                    ) : iconType === 'video' ? (
                      <Network className="w-5 h-5 text-primary-300" />
                    ) : iconType === 'image' ? (
                      <ImageIcon className="w-5 h-5 text-fuchsia-400" />
                    ) : (
                      <FileText className="w-5 h-5 text-primary-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-dark-400">
                          <span className="uppercase tracking-wider text-dark-500">Type: {iconType || 'file'}</span>
                          {isProcessing ? (
                            <span className="text-dark-300">Progress: {Math.round(smoothProgress)}%</span>
                          ) : (
                            <span className="text-dark-300">Reading: {readingProgress}%</span>
                          )}
                          {showRecommendation && (
                            <span className="text-[10px] text-primary-200/80">
                              Auto-safe for {recommendation?.model || 'model'}: {recommendation?.recommended_extraction_max_chars} chars · chunk {recommendation?.recommended_chunk_size}
                            </span>
                          )}
                          {doc.linked_to_graph && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 text-primary-200 border border-primary-500/20 px-2 py-0.5">
                              <Network className="w-3 h-3" />
                              Graph linked{doc.graph_link_count > 1 ? ` · ${doc.graph_link_count}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {queueState && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 uppercase tracking-wider">
                            {queueState}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-1 rounded-full ${statusClass}`}>{doc.status || 'ready'}</span>
                        {isRateLimited && (
                          <span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_STYLES.rate_limited}`}>
                            Paused (rate limited)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-dark-300">
                      {isProcessing && phaseFriendly && (
                        <span
                          title={`Phase: ${phaseLabel}${jobMessage ? ` · ${jobMessage}` : ''}`}
                          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 uppercase tracking-wider text-white/80"
                        >
                          {phaseFriendly}
                        </span>
                      )}
                      {isProcessing && etaMinutes !== null && (
                        <span className="text-dark-400">Est. {etaMinutes}m</span>
                      )}
                    </div>
                    {isProcessing && messageLabel && !isRateLimited && (
                      <div className="mt-1 text-[11px] text-dark-400">{messageLabel}</div>
                    )}
                    {isRateLimited && (
                      <div className="mt-2 text-[11px] text-primary-200 bg-primary-500/10 border border-primary-500/20 rounded-lg px-2 py-1">
                        Paused due to rate limits. Resume when ready.
                        {jobMessage ? ` ${jobMessage}` : ''}
                      </div>
                    )}
                    {doc.ingestion_error && (
                      <div className="mt-2 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1 flex items-center justify-between gap-2">
                        <span>{doc.ingestion_error}</span>
                        {doc.ingestion_error.toLowerCase().includes('requires an api key') && (
                          <button
                            onClick={() => navigate('/settings')}
                            className="text-[10px] uppercase tracking-widest text-rose-200 border border-rose-300/30 px-2 py-1 rounded-md hover:bg-rose-500/20"
                          >
                            Fix in Settings
                          </button>
                        )}
                      </div>
                    )}
                    {showQueueHint && (
                      <div className="mt-2 text-[11px] text-primary-200 bg-primary-500/10 border border-primary-500/20 rounded-lg px-2 py-1">
                        Queued. If this stays for a while, start the RQ worker to process jobs.
                      </div>
                    )}
                    {isProcessing && displayProgress === 0 && queueStatus !== 'connected' && (
                      <div className="mt-2 text-[11px] text-primary-200 bg-primary-500/10 border border-primary-500/20 rounded-lg px-2 py-1">
                        Running locally (queue not connected).
                      </div>
                    )}
                    {statusKey === 'extracted' && !isRateLimited && (
                      <div className="mt-2 text-[11px] text-primary-200 bg-primary-500/10 border border-primary-500/20 rounded-lg px-2 py-1">
                        Ready to read. Graph pending.
                      </div>
                    )}
                    {statusKey === 'extracted' && isRateLimited && (
                      <div className="mt-2 text-[11px] text-primary-200 bg-primary-500/10 border border-primary-500/20 rounded-lg px-2 py-1">
                        Graph build paused (rate limited).
                      </div>
                    )}
                    {isStalled && (
                      <div className="mt-2 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1">
                        No updates for {lastUpdateMinutes} min and no progress change for {progressAgeMinutes} min. Try retrying extraction.
                      </div>
                    )}
                    {lastUpdate && (
                      <div className="mt-2 text-[11px] text-dark-500">
                        Last update: {lastUpdate.toLocaleTimeString()} · {lastUpdateMinutes}m ago
                      </div>
                    )}
                    {isProcessing && progressAgeSeconds !== null && (
                      <div className="mt-2 flex items-center justify-end text-[10px] text-dark-400">
                        <span>{progressAgeSeconds < 60 ? 'Updating now' : `No change for ${progressAgeMinutes}m`}</span>
                      </div>
                    )}
                    <div className="mt-2 h-2 bg-dark-950 rounded-full overflow-hidden border border-white/5 relative">
                      <div
                        className={`h-full ${isProcessing ? 'bg-gradient-to-r from-primary-400 via-primary-500 to-primary-300' : 'bg-primary-400'} ${isProcessing ? 'animate-pulse' : ''}`}
                        style={{ width: `${Math.max(0, smoothProgress)}%` }}
                      />
                      {isProcessing && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/80 shadow-[0_0_12px_rgba(194,239,179,0.8)]"
                          style={{ left: `calc(${Math.max(0, smoothProgress)}% - 6px)` }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex w-full md:w-auto md:max-w-[360px] flex-wrap items-center gap-2 md:justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRename(doc); }}
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-dark-200 inline-flex items-center justify-center"
                      title="Rename"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    {canIngest && !isRateLimited && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSynthesize(doc.id); }}
                        className="h-9 min-w-[98px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-primary-200 text-[11px] font-semibold inline-flex items-center justify-center whitespace-nowrap"
                        title="Build graph"
                      >
                        Build Graph
                      </button>
                    )}

                    {(isRateLimited || doc.status === 'failed' || showRetryExtract || showRetryIngest) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isRateLimited) {
                            handleSynthesize(doc.id, { resume: true });
                          } else if (doc.status === 'failed' || showRetryExtract) {
                            handleReprocess(doc.id);
                          } else {
                            handleSynthesize(doc.id);
                          }
                        }}
                        className="h-9 min-w-[98px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-primary-200 text-[11px] font-semibold inline-flex items-center justify-center whitespace-nowrap"
                        title="Retry"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY }); }}
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-dark-300 inline-flex items-center justify-center"
                      title="More"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="w-9 h-9 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 inline-flex items-center justify-center"
                      title="Delete document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/documents/${doc.id}`}
                      className="h-9 min-w-[98px] px-4 rounded-lg bg-primary-500 text-white text-[11px] font-semibold inline-flex items-center justify-center whitespace-nowrap"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isLoading && documents.length > 0 && !wsConnected && (
          <div className="mt-4 text-[11px] text-dark-400">Refreshing documents...</div>
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
            {folderError && (
              <div className="mb-4 text-[12px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {folderError}
              </div>
            )}
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

      {deleteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-dark-950/80 backdrop-blur-sm" onClick={() => setDeleteModal(null)}>
          <div className="bg-dark-900 border border-white/10 rounded-2xl p-6 w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Delete document</h2>
                <p className="text-xs text-dark-400">Decide how to handle knowledge graph links.</p>
              </div>
              <button onClick={() => setDeleteModal(null)} className="p-2 rounded-lg hover:bg-white/5 text-dark-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-dark-950/60 px-4 py-3 text-sm text-white">
                {deleteModal.title}
              </div>
              <p className="text-sm text-dark-300">
                If this document is linked to a knowledge graph, you can either keep those links
                or remove them before deleting.
              </p>
              {deleteError && (
                <div className="text-[12px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  {deleteError}
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
                <button
                  onClick={() => setDeleteModal(null)}
                  className="px-4 py-2 rounded-xl border border-white/10 text-dark-300 hover:bg-white/5"
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirmDelete(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  disabled={deleteLoading}
                >
                  Delete (keep graph links)
                </button>
                <button
                  onClick={() => handleConfirmDelete(true)}
                  className="px-4 py-2 rounded-xl bg-rose-500/90 hover:bg-rose-500 text-white"
                  disabled={deleteLoading}
                >
                  Delete + remove links
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Documents;
