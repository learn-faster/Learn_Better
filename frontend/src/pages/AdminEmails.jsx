import React, { useEffect, useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { agentApi } from '../services/agent';

const AdminEmails = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await agentApi.emailLogs({ limit: 100 });
      setLogs(data.logs || []);
    } catch (e) {
      console.error('Failed to load email logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 font-black">Admin</p>
          <h1 className="text-3xl font-black text-white">Email Logs</h1>
        </div>
        <button onClick={fetchLogs} className="px-3 py-2 rounded-xl bg-white/5 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="rounded-2xl bg-dark-900/60 border border-white/10 p-4">
        {loading ? (
          <div className="text-sm text-dark-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-dark-500">No email logs yet.</div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="p-4 rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-white">
                      <Mail className="w-4 h-4 text-primary-300" />
                      <span className="font-semibold">{log.subject || '(no subject)'}</span>
                    </div>
                    <div className="text-[11px] text-dark-400">
                      {log.direction} • {log.from_email || '—'} → {log.to_email || '—'}
                    </div>
                  </div>
                  <div className="text-[10px] text-dark-500">{new Date(log.created_at).toLocaleString()}</div>
                </div>
                {log.body_text && (
                  <p className="mt-2 text-[11px] text-dark-400 line-clamp-3">{log.body_text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEmails;
