import React, { useEffect, useState } from 'react';
import { CheckCircle2, Filter, Calendar, Clock } from 'lucide-react';
import api from '../services/api';
import InlineErrorBanner from '../components/common/InlineErrorBanner';
import DailyConstellation from '../components/DailyConstellation';

const DailyGoals = () => {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [todayPlan, setTodayPlan] = useState(null);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    completed: 'all'
  });

  const fetchHistory = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = {};
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.completed !== 'all') params.completed = filters.completed === 'true';
      const data = await api.get('/goals/daily-plan/history', { params });
      setHistory(data.items || []);
    } catch (e) {
      setErrorMessage(e?.userMessage || e?.message || 'Failed to load daily goals history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchTodayPlan();
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    fetchHistory();
  };

  const fetchTodayPlan = async () => {
    try {
      const dashboardData = await api.get('/dashboard/overview');
      setTodayPlan(dashboardData?.today_plan || null);
    } catch (e) {
      setTodayPlan(null);
    }
  };

  const toggleDailyPlan = async (itemId, completed) => {
    try {
      const res = await api.patch(`/goals/daily-plan/${itemId}`, { completed: !completed });
      setTodayPlan((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.map((it) =>
          it.id === itemId ? { ...it, completed: res.completed, completed_at: res.completed_at } : it
        );
        const completedCount = updatedItems.filter((it) => it.completed).length;
        const minutesPlanned = updatedItems.reduce((sum, it) => sum + (it.duration_minutes || 0), 0);
        const minutesCompleted = updatedItems.filter((it) => it.completed).reduce((sum, it) => sum + (it.duration_minutes || 0), 0);
        return {
          ...prev,
          items: updatedItems,
          total_count: updatedItems.length,
          completed_count: completedCount,
          minutes_planned: minutesPlanned,
          minutes_completed: minutesCompleted
        };
      });
    } catch (err) {
      setErrorMessage(err?.userMessage || err?.message || 'Failed to update daily plan item.');
    }
  };

  return (
    <div className="space-y-6">
      <InlineErrorBanner message={errorMessage} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 font-black">Daily Goals</p>
          <h1 className="text-3xl font-black text-white">History & Filters</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <DailyConstellation plan={todayPlan} onToggle={toggleDailyPlan} variant="expanded" />
          <div className="flex items-center gap-3 text-[10px] text-dark-400 uppercase tracking-widest">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary-400 shadow-[0_0_6px_rgba(194,239,179,0.6)]" />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-white/30" />
              Pending
            </span>
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-dark-900/60 border border-white/10 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 font-black">Today’s Tasks</p>
          {todayPlan?.items?.length ? (
            todayPlan.items.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleDailyPlan(item.id, item.completed)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${item.completed ? 'border-primary-500/30 bg-primary-500/10' : 'border-white/10 bg-white/5 hover:border-primary-500/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className={`text-sm font-semibold ${item.completed ? 'text-primary-200 line-through' : 'text-white'}`}>{item.title}</p>
                    {item.notes && <p className="text-[11px] text-dark-500">{item.notes}</p>}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-dark-400">{item.duration_minutes}m</span>
                </div>
              </button>
            ))
          ) : (
            <div className="text-xs text-dark-500">No daily tasks available yet.</div>
          )}
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
              <div key={item.id} className={`p-4 rounded-xl border ${item.completed ? 'border-primary-500/30' : 'border-white/5'} bg-white/5`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-4 h-4 ${item.completed ? 'text-primary-300' : 'text-dark-500'}`} />
                      <span className={`text-sm font-semibold ${item.completed ? 'text-primary-200' : 'text-white'}`}>{item.title}</span>
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
