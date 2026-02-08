import React, { useEffect, useState } from 'react';
import { CheckCircle2, Filter, Calendar, Clock } from 'lucide-react';
import api from '../services/api';

const DailyGoals = () => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    completed: 'all'
  });

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.completed !== 'all') params.completed = filters.completed === 'true';
      const data = await api.get('/goals/daily-plan/history', { params });
      setHistory(data.items || []);
    } catch (e) {
      console.error('Failed to load daily goals history', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    fetchHistory();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 font-black">Daily Goals</p>
          <h1 className="text-3xl font-black text-white">History & Filters</h1>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-dark-900/60 border border-white/10 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-[10px] text-dark-400 uppercase tracking-widest mb-1">From</label>
          <input type="date" value={filters.dateFrom} onChange={(e) => handleFilterChange('dateFrom', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-dark-400 uppercase tracking-widest mb-1">To</label>
          <input type="date" value={filters.dateTo} onChange={(e) => handleFilterChange('dateTo', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-dark-400 uppercase tracking-widest mb-1">Status</label>
          <select value={filters.completed} onChange={(e) => handleFilterChange('completed', e.target.value)} className={inputClass}>
            <option value="all">All</option>
            <option value="true">Completed</option>
            <option value="false">Incomplete</option>
          </select>
        </div>
        <button onClick={handleApply} className="px-4 py-2 rounded-xl bg-primary-500 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
          <Filter className="w-4 h-4" /> Apply
        </button>
      </div>

      <div className="rounded-2xl bg-dark-900/60 border border-white/10 p-4">
        {isLoading ? (
          <div className="text-sm text-dark-400">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-sm text-dark-500">No daily goals found.</div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <div key={item.id} className={`p-4 rounded-xl border ${item.completed ? 'border-emerald-500/30' : 'border-white/5'} bg-white/5`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-4 h-4 ${item.completed ? 'text-emerald-400' : 'text-dark-500'}`} />
                      <span className={`text-sm font-semibold ${item.completed ? 'text-emerald-200' : 'text-white'}`}>{item.title}</span>
                    </div>
                    {item.notes && <p className="text-[11px] text-dark-500">{item.notes}</p>}
                  </div>
                  <div className="text-[10px] text-dark-400 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {item.date}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.duration_minutes}m</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const inputClass = "w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white placeholder:text-dark-500 focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20";

export default DailyGoals;
