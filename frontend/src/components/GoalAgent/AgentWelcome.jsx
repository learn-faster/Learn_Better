import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import CelestialBackground from './CelestialBackground';
import SolarCoreIcon from './SolarCoreIcon';

const AgentWelcome = ({ onStart, onSkip }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  // No chat state needed on the welcome screen.

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let animationId = 0;
    const stars = Array.from({ length: 150 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.8 + 0.2,
      speed: Math.random() * 0.6 + 0.2
    }));
    const comets = Array.from({ length: 5 }).map(() => ({
      x: Math.random() * 1.4 - 0.2,
      y: Math.random() * 0.7 - 0.3,
      vx: 0.35 + Math.random() * 0.25,
      vy: 0.18 + Math.random() * 0.18,
      size: 2.4 + Math.random() * 2.4,
      life: Math.random() * 0.8 + 0.4,
      glow: Math.random() * 0.4 + 0.7
    }));

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawShuttle = (time) => {
      const t = time * 0.001;
      const bob = Math.sin(t * 1.1) * 6;
      const entry = Math.min(1, t * 0.12);
      const shuttleX = width * 0.62;
      const shuttleY = height * (0.95 - 0.45 * entry) + bob;

      ctx.save();
      ctx.translate(shuttleX, shuttleY);
      ctx.rotate(-0.18);

      const glow = ctx.createRadialGradient(0, 18, 0, 0, 18, 80);
      glow.addColorStop(0, 'rgba(59,130,246,0.28)');
      glow.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, 24, 70, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      const bodyGrad = ctx.createLinearGradient(-30, -20, 30, 40);
      bodyGrad.addColorStop(0, '#e2e8f0');
      bodyGrad.addColorStop(0.6, '#94a3b8');
      bodyGrad.addColorStop(1, '#1f2937');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(-32, -12);
      ctx.quadraticCurveTo(0, -36, 30, -8);
      ctx.quadraticCurveTo(40, 6, 18, 26);
      ctx.quadraticCurveTo(0, 38, -22, 28);
      ctx.quadraticCurveTo(-42, 10, -32, -12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(6, -6, 9, 6, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(56,189,248,0.55)';
      ctx.beginPath();
      ctx.moveTo(-10, 22);
      ctx.lineTo(-32, 40);
      ctx.lineTo(-4, 34);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(18, 10, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

    };

    const resetComet = (c) => {
      c.x = Math.random() * -0.4 - 0.2;
      c.y = Math.random() * 0.7 - 0.3;
      c.vx = 0.35 + Math.random() * 0.3;
      c.vy = 0.18 + Math.random() * 0.2;
      c.size = 2.2 + Math.random() * 2.6;
      c.life = Math.random() * 0.8 + 0.5;
      c.glow = Math.random() * 0.4 + 0.7;
    };

    const drawComet = (c) => {
      const cx = c.x * width;
      const cy = c.y * height;
      const tailLength = Math.max(width, height) * 0.45 * c.life;
      const angle = Math.atan2(c.vy, c.vx) + Math.PI;
      const tx = cx + Math.cos(angle) * tailLength;
      const ty = cy + Math.sin(angle) * tailLength;

      const tail = ctx.createLinearGradient(cx, cy, tx, ty);
      tail.addColorStop(0, `rgba(148,197,253,${0.55 * c.glow})`);
      tail.addColorStop(0.4, `rgba(56,189,248,${0.25 * c.glow})`);
      tail.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.strokeStyle = tail;
      ctx.lineWidth = 2.6 * c.size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      const head = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14 * c.size);
      head.addColorStop(0, `rgba(255,255,255,${0.9 * c.glow})`);
      head.addColorStop(0.4, `rgba(191,219,254,${0.7 * c.glow})`);
      head.addColorStop(1, 'rgba(148,197,253,0)');
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 * c.size, 0, Math.PI * 2);
      ctx.fill();
    };

    const loop = (time) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(5, 8, 18, 0.6)';
      ctx.fillRect(0, 0, width, height);

      stars.forEach((s) => {
        s.x += s.speed * 0.0006;
        if (s.x > 1.1) s.x = -0.1;
        const px = s.x * width;
        const py = s.y * height;
        const size = s.z * 2;
        ctx.fillStyle = `rgba(220,214,247,${0.35 + s.z * 0.5})`;
        ctx.fillRect(px, py, size, size);
      });

      comets.forEach((c) => {
        c.x += c.vx * 0.001;
        c.y += c.vy * 0.001;
        c.life -= 0.0022;
        drawComet(c);
        if (c.x > 1.2 || c.y > 1.1 || c.life <= 0) {
          resetComet(c);
        }
      });

      drawShuttle(time);
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[130] bg-[#05060f]/95 backdrop-blur-2xl overflow-hidden">
      <CelestialBackground className="absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1026]/70 via-transparent to-[#0b2a5c]/60" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_20%,rgba(59,130,246,0.35),transparent_45%),radial-gradient(circle_at_75%_25%,rgba(94,234,212,0.26),transparent_48%),radial-gradient(circle_at_50%_75%,rgba(224,231,255,0.18),transparent_55%)]" />

      <div className="relative z-10 h-full w-full px-6 py-8">
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-auto z-20">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl shadow-[0_0_24px_rgba(96,165,250,0.2)]">
            <div className="h-8 w-8 rounded-full flex items-center justify-center">
              <SolarCoreIcon size={28} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-200 font-black">Goal Agent</p>
              <p className="text-[10px] text-slate-300/70">Mission briefing online.</p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="text-xs font-semibold text-slate-200 hover:text-white transition-colors px-4 py-2 rounded-full border border-white/15 bg-white/5 shadow-[0_0_22px_rgba(129,140,248,0.35)]"
          >
            Skip
          </button>
        </div>

        <div ref={containerRef} className="absolute inset-0 pointer-events-none">
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-6">
            <p className="text-[10px] uppercase tracking-[0.4em] text-slate-300/80 font-black">Mission Control</p>
            <h1 className="text-4xl md:text-5xl font-black text-white mt-3 drop-shadow-[0_0_30px_rgba(147,197,253,0.35)]">
              Chart your learning trajectory
            </h1>
            <p className="text-slate-300/80 mt-3 max-w-2xl">
              Tell me your mission. I’ll build your plan, checkpoints, and pace.
            </p>
          </div>

          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="mb-6 flex items-center justify-center"
          >
            <div className="relative w-[140px] h-[140px]">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-white/15 shadow-[0_0_30px_rgba(59,130,246,0.35)]"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-3 rounded-full border border-white/10"
              />
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.45),transparent_65%)] blur-2xl" />
                  <span className="absolute inset-2 rounded-full bg-[radial-gradient(circle,rgba(94,234,212,0.55),transparent_70%)] blur-xl" />
                  <SolarCoreIcon size={56} />
                </div>
              </motion.div>
            </div>
          </motion.div>

          <div className="mt-4 w-full max-w-2xl flex items-center justify-center text-[10px] text-slate-300/60">
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-300 to-indigo-300 text-slate-900 font-bold uppercase tracking-[0.2em] text-[10px] shadow-[0_0_18px_rgba(129,140,248,0.35)]"
            >
              Start Onboarding <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentWelcome;
