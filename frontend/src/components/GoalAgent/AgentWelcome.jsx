import React from 'react';
import { ArrowRight, CheckCircle2, Sparkles, Radar, Waves } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'Personalized Learning Path',
    description: 'Answer a few questions and I will build your goal‑aligned roadmap.'
  },
  {
    icon: Radar,
    title: 'Focus + Accountability',
    description: 'Smart check‑ins, guided sessions, and gentle corrections keep you on track.'
  },
  {
    icon: Waves,
    title: 'Weekly Progress Digest',
    description: 'Receive a clean summary of momentum and the next best actions.'
  }
];

const AgentWelcome = ({ onStart, onSkip }) => {
  return (
    <div className="fixed inset-0 z-[130] bg-dark-950/95 backdrop-blur-2xl overflow-hidden">
      <div className="absolute inset-0 universe-stars opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-cyan-500/10" />

      <div className="relative z-10 h-full w-full max-w-6xl mx-auto px-6 py-10 flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="agent-orb h-10 w-10 rounded-full flex items-center justify-center">
              <span className="agent-orb-shell">
                <span className="agent-orb-halo" />
                <span className="agent-orb-aurora" />
                <span className="agent-orb-ring" />
                <span className="agent-orb-core" />
                <span className="agent-orb-star agent-orb-star-1" />
                <span className="agent-orb-star agent-orb-star-2" />
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary-300 font-black">Goal Agent</p>
              <p className="text-[10px] text-dark-400">Personal guidance, always on.</p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="text-xs font-semibold text-dark-400 hover:text-white transition-colors"
          >
            Skip for now
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              Meet your learning
              <span className="block bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-cyan-400">
                mission control.
              </span>
            </h1>
            <p className="text-dark-300 mt-4 max-w-lg">
              I will help you set goals, build a learning path, and keep your momentum strong.
              This takes less than two minutes.
            </p>

            <div className="mt-6 space-y-3">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center text-primary-300">
                    <f.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs text-dark-400">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-white/10 bg-dark-900/60 backdrop-blur-xl p-8 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="agent-orb h-12 w-12 rounded-full flex items-center justify-center">
                <span className="agent-orb-shell">
                  <span className="agent-orb-halo" />
                  <span className="agent-orb-aurora" />
                  <span className="agent-orb-ring" />
                  <span className="agent-orb-core" />
                  <span className="agent-orb-star agent-orb-star-1" />
                  <span className="agent-orb-star agent-orb-star-2" />
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-white">Quick Personalization</p>
                <p className="text-xs text-dark-400">Set goals, schedule, and integrations.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {['Define goals', 'Set preferences', 'Connect tools'].map((step, idx) => (
                <div key={step} className="flex items-center gap-3 text-sm text-dark-300">
                  <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
                    {idx + 1}
                  </div>
                  {step}
                </div>
              ))}
            </div>

            <button
              onClick={onStart}
              className="mt-8 w-full py-3 rounded-2xl bg-gradient-to-r from-primary-600 to-cyan-500 text-white font-bold text-sm uppercase tracking-[0.2em] shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
            >
              Start Personalization <ArrowRight className="w-4 h-4" />
            </button>

            <div className="mt-4 flex items-center gap-2 text-[10px] text-dark-400">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Takes ~2 minutes. You can change anything later.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentWelcome;
