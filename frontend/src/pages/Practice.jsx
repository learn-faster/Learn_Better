import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Rocket, Timer, Flame, CheckCircle2, ClipboardCheck, Lightbulb, RefreshCw } from "lucide-react";

import usePracticeStore from "../stores/usePracticeStore";
import { Card } from "../components/ui/card";

const modes = [
  { key: "quick", title: "Quick Orbit", minutes: 12, description: "Fast interleaved recall to keep momentum.", icon: Rocket },
  { key: "focus", title: "Focus Burn", minutes: 25, description: "Best for daily stability + retrieval strength.", icon: Flame },
  { key: "deep", title: "Deep Ascent", minutes: 40, description: "Longer drills with mixed tasks and frontier prompts.", icon: Sparkles },
];

const Practice = () => {
  const {
    sessionId,
    items,
    sourceMix,
    targetDuration,
    currentIndex,
    summary,
    history,
    isLoading,
    startSession,
    submitItem,
    advanceItem,
    endSession,
    fetchHistory,
    resetSession,
  } = usePracticeStore();

  const [mode, setMode] = useState("focus");
  const [customMinutes, setCustomMinutes] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [rating, setRating] = useState(4);
  const [itemStartTime, setItemStartTime] = useState(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [reflection, setReflection] = useState("");
  const [effectiveness, setEffectiveness] = useState(4);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => { if (sessionId && items.length > 0) setItemStartTime(Date.now()); }, [sessionId, items.length, currentIndex]);

  const currentItem = items[currentIndex];
  const recommended = useMemo(() => { const m = modes.find((m) => m.key === mode); return m ? m.minutes : 25; }, [mode]);
  const mixDisplay = useMemo(() => {
    const entries = Object.entries(sourceMix || {});
    if (!entries.length) return "";
    return entries.map(([key, value]) => value + " " + key.replace("_", " ")).join(" + ");
  }, [sourceMix]);

  const handleStart = async () => {
    const duration = customMinutes ? Number(customMinutes) : null;
    await startSession({ mode, duration_minutes: duration });
    setShowAnswer(false);
    setResponseText("");
    setWrapUp(false);
  };

  const handleSubmit = async () => {
    if (!currentItem) return;
    const timeTaken = itemStartTime ? Math.round((Date.now() - itemStartTime) / 1000) : null;
    await submitItem({ item_id: currentItem.id, response_text: responseText, rating: rating, time_taken: timeTaken });
    if (currentIndex >= items.length - 1) {
      setWrapUp(true);
    } else {
      advanceItem();
      setShowAnswer(false);
      setResponseText("");
      setRating(4);
    }
  };

  const handleEnd = async () => {
    await endSession({ reflection, effectiveness_rating: effectiveness });
    await fetchHistory();
  };

  const handleReset = () => {
    resetSession();
    setWrapUp(false);
    setResponseText("");
    setReflection("");
  };

  if (summary) {
    return (
      <div className="max-w-5xl mx-auto space-y-10 pb-20">
        <Card className="bg-gradient-to-br from-primary-600/15 to-transparent border border-primary-500/20">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary-300 font-black">Session Complete</p>
              <h1 className="text-3xl font-black text-white mt-3">Practice Engine Summary</h1>
              <p className="text-dark-400 mt-2">You completed {summary.items_completed} items at an average score of {(summary.average_score * 100).toFixed(0)}%.</p>
            </div>
            <button onClick={handleReset} className="btn-secondary px-6 py-3">Start New Session</button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="card-premium"><p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Duration</p><p className="text-3xl font-black text-white mt-2">{summary.target_duration_minutes} min</p></Card>
          <Card className="card-premium"><p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Items</p><p className="text-3xl font-black text-white mt-2">{summary.items_completed}</p></Card>
          <Card className="card-premium"><p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Avg Score</p><p className="text-3xl font-black text-white mt-2">{(summary.average_score * 100).toFixed(0)}%</p></Card>
        </div>

        <Card className="card-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Recent Sessions</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {history.slice(0, 4).map((item) => (
              <div key={item.session_id} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-xs text-dark-400">{new Date(item.start_time).toLocaleString()}</p>
                <p className="text-lg font-bold text-white mt-1 capitalize">{item.mode}</p>
                <p className="text-xs text-dark-400 mt-1">Items: {item.items_completed} · Avg: {(item.average_score * 100).toFixed(0)}%</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (sessionId && currentItem && !wrapUp) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-dark-500 font-black">Practice Engine</p>
            <h1 className="text-3xl font-black text-white mt-2">Item {currentIndex + 1} of {items.length}</h1>
            <p className="text-dark-400 mt-2">Mode: <span className="text-white font-semibold capitalize">{mode}</span> · Target {targetDuration} min</p>
          </div>
          <button onClick={handleReset} className="btn-ghost">Reset</button>
        </div>

        <Card className="card-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-300 font-black">{currentItem.item_type.replace("_", " ")}</p>
          <h2 className="text-2xl font-bold text-white mt-3 whitespace-pre-line">{currentItem.prompt}</h2>

          {currentItem.item_type === "flashcard" && currentItem.expected_answer && (
            <div className="mt-6">
              <button onClick={() => setShowAnswer((prev) => !prev)} className="btn-secondary px-5 py-2">
                {showAnswer ? "Hide Answer" : "Reveal Answer"}
              </button>
              {showAnswer && (
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 text-dark-100">
                  {currentItem.expected_answer}
                </div>
              )}
            </div>
          )}

          {currentItem.item_type !== "flashcard" && (
            <div className="mt-6">
              <label className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Your Response</label>
              <textarea className="w-full mt-2 min-h-[140px]" value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Write your recall in your own words..." />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <label className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Recall Quality</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} onClick={() => setRating(value)} className={
                  "px-3 py-2 rounded-xl border text-sm font-bold " + (rating === value ? "bg-primary-500/20 border-primary-500 text-primary-200" : "bg-white/5 border-white/10 text-dark-400")
                }>{value}</button>
              ))}
            </div>
          </div>

          <button onClick={handleSubmit} className="btn-primary mt-8 px-6 py-3"><CheckCircle2 className="w-5 h-5" />Submit & Continue</button>
        </Card>
      </div>
    );
  }

  if (sessionId && !currentItem && !wrapUp) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        <Card className="card-premium">
          <h2 className="text-2xl font-bold text-white">No practice items available</h2>
          <p className="text-dark-400 mt-2">Add flashcards or generate a curriculum to unlock practice content.</p>
          <button onClick={handleReset} className="btn-secondary mt-6 px-6 py-3">Back to Practice Setup</button>
        </Card>
      </div>
    );
  }

  if (sessionId && wrapUp) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <Card className="card-premium">
          <p className="text-xs uppercase tracking-[0.3em] text-primary-300 font-black">Wrap Up</p>
          <h1 className="text-3xl font-black text-white mt-3">Reflect and finalize</h1>
          <p className="text-dark-400 mt-2">Log a quick reflection to help the agent adapt pacing.</p>

          <div className="mt-6">
            <label className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Reflection</label>
            <textarea className="w-full mt-2 min-h-[140px]" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="What felt easy or hard? What should change tomorrow?" />
          </div>

          <div className="mt-6">
            <label className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Session Effectiveness</label>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} onClick={() => setEffectiveness(value)} className={
                  "px-3 py-2 rounded-xl border text-sm font-bold " + (effectiveness === value ? "bg-primary-500/20 border-primary-500 text-primary-200" : "bg-white/5 border-white/10 text-dark-400")
                }>{value}</button>
              ))}
            </div>
          </div>

          <button onClick={handleEnd} className="btn-primary mt-8 px-6 py-3"><ClipboardCheck className="w-5 h-5" />Finish Session</button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-dark-500 font-black">Practice Engine</p>
          <h1 className="text-4xl font-black text-white mt-3">Daily Execution Layer</h1>
          <p className="text-dark-400 mt-2">Interleaved recall from SRS, curriculum tasks, and frontier concepts.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchHistory} className="btn-ghost"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modes.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          const className = "text-left p-6 rounded-3xl border transition-all " + (active ? "border-primary-500/60 bg-primary-500/10" : "border-white/10 bg-dark-900/60");
          return (
            <motion.button key={m.key} onClick={() => setMode(m.key)} whileHover={{ y: -4 }} className={className}>
              <div className="flex items-center justify-between">
                <Icon className="w-6 h-6 text-primary-300" />
                {active && <span className="text-[10px] uppercase tracking-[0.3em] text-primary-300 font-black">Selected</span>}
              </div>
              <h3 className="text-xl font-bold text-white mt-4">{m.title}</h3>
              <p className="text-dark-400 mt-2 text-sm">{m.description}</p>
              <p className="text-sm font-bold text-primary-200 mt-4">~{m.minutes} min</p>
            </motion.button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="card-premium lg:col-span-2">
          <div className="flex items-center gap-3">
            <Timer className="w-5 h-5 text-primary-300" />
            <p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Session Tuning</p>
          </div>
          <h2 className="text-2xl font-bold text-white mt-4">Science-backed timing</h2>
          <p className="text-dark-400 mt-2">Recommended {recommended} min based on cognitive load and retrieval spacing.</p>
          <div className="mt-6 flex flex-col md:flex-row gap-4">
            <input type="number" min="5" max="180" placeholder="Custom minutes (optional)" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} className="flex-1" />
            <button onClick={handleStart} disabled={isLoading} className="btn-primary px-6 py-3"><Rocket className="w-5 h-5" />{isLoading ? "Preparing..." : "Start Practice"}</button>
          </div>
          <div className="mt-4 text-xs text-dark-500">You can override duration, but the engine will still balance the item mix for retention.</div>
        </Card>
        <Card className="card-premium">
          <div className="flex items-center gap-3">
            <Lightbulb className="w-5 h-5 text-primary-300" />
            <p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">How It Builds</p>
          </div>
          <p className="text-sm text-dark-400 mt-4">The engine interleaves due SRS cards, curriculum practice tasks, and frontier concepts so you train recall and growth in one loop.</p>
          {mixDisplay && <div className="mt-4 text-xs text-primary-200">Last mix: {mixDisplay}</div>}
        </Card>
      </div>

      <Card className="card-premium">
        <p className="text-xs uppercase tracking-[0.2em] text-dark-500 font-black">Recent Sessions</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {history.length === 0 && <div className="text-sm text-dark-400">No sessions yet. Start your first practice loop.</div>}
          {history.slice(0, 6).map((item) => (
            <div key={item.session_id} className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <p className="text-xs text-dark-400">{new Date(item.start_time).toLocaleString()}</p>
              <p className="text-lg font-bold text-white mt-1 capitalize">{item.mode}</p>
              <p className="text-xs text-dark-400 mt-1">Items: {item.items_completed} · Avg: {(item.average_score * 100).toFixed(0)}%</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Practice;
