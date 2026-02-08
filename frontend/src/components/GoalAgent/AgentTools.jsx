import React, { useState } from 'react';
import { Camera, Mail, StickyNote } from 'lucide-react';
import { agentApi } from '../../services/agent';

const AgentTools = ({ status }) => {
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [screenshotPrompt, setScreenshotPrompt] = useState('');
  const [analyze, setAnalyze] = useState(true);
  const [shotResult, setShotResult] = useState(null);

  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailStatus, setEmailStatus] = useState(null);

  const [scratchpad, setScratchpad] = useState('');
  const [scratchpadStatus, setScratchpadStatus] = useState(null);

  const captureScreenshot = async () => {
    if (!screenshotUrl.trim()) return;
    setShotResult(null);
    try {
      const result = await agentApi.screenshot({ url: screenshotUrl, analyze, prompt: screenshotPrompt || undefined });
      setShotResult(result);
    } catch (e) {
      setShotResult({ error: String(e) });
    }
  };

  const sendEmail = async () => {
    if (!emailTo || !emailSubject || !emailBody) return;
    setEmailStatus(null);
    try {
      const result = await agentApi.email({ to: emailTo, subject: emailSubject, body: emailBody });
      setEmailStatus(result.status);
    } catch (e) {
      setEmailStatus('failed');
    }
  };

  const saveScratchpad = async () => {
    if (!scratchpad.trim()) return;
    setScratchpadStatus(null);
    try {
      await agentApi.scratchpad({ content: scratchpad });
      setScratchpadStatus('saved');
      setScratchpad('');
    } catch (e) {
      setScratchpadStatus('failed');
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-6">
      <ToolCard title="Screenshot tool" icon={Camera}>
        <input className={inputClass} placeholder="https://example.com" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} />
        <input className={inputClass} placeholder="Optional analysis prompt" value={screenshotPrompt} onChange={(e) => setScreenshotPrompt(e.target.value)} />
        <label className="text-xs text-dark-400 flex items-center gap-2">
          <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} /> Analyze with vision model
        </label>
        <button onClick={captureScreenshot} className={btnClass}>Capture</button>
        {shotResult?.image_url && (
          <div className="mt-3 space-y-2">
            <img src={shotResult.image_url} alt="Screenshot" className="rounded-xl border border-white/10" />
            {shotResult.analysis && (
              <p className="text-xs text-dark-300">{shotResult.analysis}</p>
            )}
          </div>
        )}
        {shotResult?.error && <p className="text-xs text-amber-300">{shotResult.error}</p>}
      </ToolCard>

      <ToolCard title="Send email" icon={Mail}>
        {!status?.email_configured && (
          <p className="text-xs text-amber-300">Email not configured — set it in Settings.</p>
        )}
        <input className={inputClass} placeholder="to@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
        <input className={inputClass} placeholder="Subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
        <textarea className={inputClass} rows={3} placeholder="Write your email..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
        <button
          onClick={sendEmail}
          disabled={!status?.email_configured}
          className={`${btnClass} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          Send
        </button>
        {emailStatus && <p className="text-xs text-dark-400">Status: {emailStatus}</p>}
      </ToolCard>

      <ToolCard title="Scratchpad" icon={StickyNote}>
        <textarea className={inputClass} rows={3} placeholder="Save a quick note..." value={scratchpad} onChange={(e) => setScratchpad(e.target.value)} />
        <button onClick={saveScratchpad} className={btnClass}>Save note</button>
        {scratchpadStatus && <p className="text-xs text-dark-400">{scratchpadStatus}</p>}
      </ToolCard>
    </div>
  );
};

const ToolCard = ({ title, icon: Icon, children }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
    <div className="flex items-center gap-2 text-sm font-semibold text-white">
      <Icon className="w-4 h-4 text-primary-300" /> {title}
    </div>
    {children}
  </div>
);

const inputClass = "w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white placeholder:text-dark-500 focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20";
const btnClass = "px-3 py-2 text-xs font-bold rounded-lg bg-primary-500/90 hover:bg-primary-500 text-white";

export default AgentTools;
