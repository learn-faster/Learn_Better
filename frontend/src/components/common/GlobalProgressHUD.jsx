import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import GraphService from '../../services/graphs';
import useDocumentStore from '../../stores/useDocumentStore';

const ACTIVE_DOC_STATUSES = ['processing', 'pending', 'ingesting', 'uploading'];

const ProgressBar = ({ value }) => (
  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
    <div className="h-full bg-white/70" style={{ width: `${Math.max(2, value)}%` }} />
  </div>
);

const GlobalProgressHUD = () => {
  const { documents, fetchDocuments } = useDocumentStore();
  const [graphs, setGraphs] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const activeDocs = useMemo(
    () => documents.filter((doc) => ACTIVE_DOC_STATUSES.includes(doc.status)),
    [documents]
  );

  const activeGraphs = useMemo(
    () => graphs.filter((graph) => graph.status === 'building'),
    [graphs]
  );

  useEffect(() => {
    let interval;
    const tick = async () => {
      await fetchDocuments(true, { minIntervalMs: 8000 });
      try {
        const data = await GraphService.listGraphs();
        setGraphs(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      } finally {
        setLastUpdated(new Date());
      }
    };

    if (activeDocs.length > 0 || activeGraphs.length > 0 || open) {
      tick();
      interval = setInterval(tick, 8000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeDocs.length, activeGraphs.length, open, fetchDocuments]);

  if (activeDocs.length === 0 && activeGraphs.length === 0) return null;

  const totalActive = activeDocs.length + activeGraphs.length;

  return (
    <div className="fixed bottom-6 right-6 z-[120]">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-widest text-white/80 hover:bg-white/20 transition-all backdrop-blur"
      >
        <Activity className="w-4 h-4" />
        {totalActive} Active
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mt-3 w-80 rounded-2xl glass-dark border border-white/10 p-4 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/50 font-black">
              <span>Processing</span>
              {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
            </div>

            {activeDocs.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-black">Documents</div>
                {activeDocs.map((doc) => (
                  <div key={doc.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-white/80">
                      <span className="truncate">{doc.title || doc.filename}</span>
                      <span>{Math.round(doc.progress_percent ?? doc.ingestion_progress ?? 0)}%</span>
                    </div>
                    <ProgressBar value={doc.progress_percent ?? doc.ingestion_progress ?? 0} />
                  </div>
                ))}
              </div>
            )}

            {activeGraphs.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-black">Knowledge Maps</div>
                {activeGraphs.map((graph) => (
                  <div key={graph.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-white/80">
                      <span className="truncate">{graph.name || 'Untitled Graph'}</span>
                      <span>{Math.round(graph.build_progress || 0)}%</span>
                    </div>
                    <ProgressBar value={graph.build_progress || 0} />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GlobalProgressHUD;
