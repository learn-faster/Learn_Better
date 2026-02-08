import React, { useState } from 'react';
import { CheckCircle2, ChevronRight, Mail, HeartPulse } from 'lucide-react';
import { agentApi } from '../../services/agent';

const inputClass = "w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white placeholder:text-dark-500 focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20";

const AgentOnboarding = ({ onComplete, onOpenSettings }) => {
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [goals, setGoals] = useState({ short: '', near: '', long: '' });
  const [weeklyHours, setWeeklyHours] = useState('6');
  const [focusStyle, setFocusStyle] = useState('deep');
  const [preferredTime, setPreferredTime] = useState('morning');
  const [email, setEmail] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [fitbitClientId, setFitbitClientId] = useState('');
  const [fitbitClientSecret, setFitbitClientSecret] = useState('');
  const [fitbitRedirectUri, setFitbitRedirectUri] = useState('http://localhost:5173/api/fitbit/callback');

  const steps = ['Goals', 'Preferences', 'Integrations'];

  const saveOnboarding = async () => {
    setIsSaving(true);
    try {
      const onboarding = {
        weekly_hours: weeklyHours,
        focus_style: focusStyle,
        preferred_time: preferredTime,
        goals
      };

      const goalsPayload = [];
      if (goals.short.trim()) goalsPayload.push({ title: goals.short, domain: 'learning', target_hours: 20, priority: 1 });
      if (goals.near.trim()) goalsPayload.push({ title: goals.near, domain: 'learning', target_hours: 40, priority: 2 });
      if (goals.long.trim()) goalsPayload.push({ title: goals.long, domain: 'learning', target_hours: 80, priority: 3 });

      await agentApi.onboarding({ onboarding, goals: goalsPayload });

      await agentApi.saveSettings({
        email,
        resend_api_key: resendApiKey,
        use_biometrics: useBiometrics,
        fitbit_client_id: fitbitClientId,
        fitbit_client_secret: fitbitClientSecret,
        fitbit_redirect_uri: fitbitRedirectUri
      });

      onComplete?.();
    } catch (e) {
      console.error('Failed to save onboarding', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-white/5">
        <p className="text-sm font-semibold text-white tracking-wide">Personalize your agent</p>
        <p className="text-[11px] text-dark-400 mt-1">Help me build a pacing model that fits your goals and energy.</p>
        <div className="mt-3 flex gap-2">
          {steps.map((label, idx) => (
            <div
              key={label}
              className={`text-[10px] px-3 py-1 rounded-full border ${idx === step ? 'bg-primary-500/20 text-primary-200 border-primary-500/40' : 'bg-white/5 text-dark-500 border-white/10'}`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 custom-scrollbar">
        {step === 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-dark-400">Define what “success” looks like at each time horizon.</p>
              <div className="mt-4 space-y-4">
                <Field label="Short‑term goal (days)">
                  <input className={inputClass} value={goals.short} onChange={(e) => setGoals({ ...goals, short: e.target.value })} placeholder="e.g. Finish chapter 2" />
                </Field>
                <Field label="Near‑term goal (weeks)">
                  <input className={inputClass} value={goals.near} onChange={(e) => setGoals({ ...goals, near: e.target.value })} placeholder="e.g. Complete ML basics" />
                </Field>
                <Field label="Long‑term goal (months+)">
                  <input className={inputClass} value={goals.long} onChange={(e) => setGoals({ ...goals, long: e.target.value })} placeholder="e.g. Build portfolio project" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <Field label="Available hours per week">
                <input className={inputClass} type="number" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
              </Field>
              <Field label="Focus style">
                <select className={inputClass} value={focusStyle} onChange={(e) => setFocusStyle(e.target.value)}>
                  <option value="deep">Deep work blocks</option>
                  <option value="short">Short bursts</option>
                  <option value="mixed">Mixed schedule</option>
                </select>
              </Field>
              <Field label="Preferred time">
                <select className={inputClass} value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)}>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
                <Mail className="w-4 h-4 text-primary-300" /> Email setup
              </div>
              <Field label="Email">
                <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
              </Field>
              <Field label="Resend API key">
                <input className={inputClass} value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_..." />
              </Field>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <HeartPulse className="w-4 h-4 text-emerald-300" /> Fitbit (optional)
                </div>
                <label className="text-xs text-dark-400 flex items-center gap-2">
                  <input type="checkbox" checked={useBiometrics} onChange={(e) => setUseBiometrics(e.target.checked)} /> Enable
                </label>
              </div>
              {useBiometrics && (
                <div className="mt-3 space-y-2">
                  <Field label="Client ID">
                    <input className={inputClass} value={fitbitClientId} onChange={(e) => setFitbitClientId(e.target.value)} />
                  </Field>
                  <Field label="Client Secret">
                    <input className={inputClass} value={fitbitClientSecret} onChange={(e) => setFitbitClientSecret(e.target.value)} />
                  </Field>
                  <Field label="Redirect URI">
                    <input className={inputClass} value={fitbitRedirectUri} onChange={(e) => setFitbitRedirectUri(e.target.value)} />
                  </Field>
                  <button
                    onClick={() => window.location.href = '/api/fitbit/auth'}
                    className="mt-2 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white"
                  >
                    Connect Fitbit
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/5 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="text-xs text-dark-400 hover:text-white"
          disabled={step === 0}
        >
          Back
        </button>
        {step < 2 ? (
          <button
            onClick={() => setStep((s) => Math.min(2, s + 1))}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-primary-500/90 hover:bg-primary-500 text-white flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={saveOnboarding}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white flex items-center gap-1"
          >
            <CheckCircle2 className="w-4 h-4" /> Finish
          </button>
        )}
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[11px] text-dark-400 mb-1">{label}</label>
    {children}
  </div>
);

export default AgentOnboarding;
