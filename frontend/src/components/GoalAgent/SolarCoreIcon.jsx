import React from 'react';

const SolarCoreIcon = ({ className = '', size = 32 }) => (
  <svg
    className={`${className} agent-blackhole-svg`}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      {/* Deep Event Horizon Glow */}
      <radialGradient id="eventHorizon" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 32) rotate(90) scale(18)">
        <stop offset="0" stopColor="#000000" />
        <stop offset="0.75" stopColor="#050508" />
        <stop offset="1" stopColor="rgba(220, 214, 247, 0.15)" />
      </radialGradient>

      {/* Accretion Disk - Einstein Ring Effect */}
      <linearGradient id="accretionDiskPrimary" x1="0" y1="32" x2="64" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="rgba(194, 239, 179, 0)" />
        <stop offset="0.15" stopColor="rgba(194, 239, 179, 0.4)" />
        <stop offset="0.5" stopColor="#dcd6f7" />
        <stop offset="0.85" stopColor="rgba(194, 239, 179, 0.4)" />
        <stop offset="1" stopColor="rgba(194, 239, 179, 0)" />
      </linearGradient>

      {/* Gravitational Lensing Glow */}
      <radialGradient id="lensingGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 32) rotate(90) scale(32)">
        <stop offset="0" stopColor="rgba(220, 214, 247, 0.1)" />
        <stop offset="0.5" stopColor="rgba(194, 239, 179, 0.05)" />
        <stop offset="1" stopColor="transparent" />
      </radialGradient>

      {/* High-intensity Edge */}
      <radialGradient id="photonSphere" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 32) rotate(90) scale(14)">
        <stop offset="0" stopColor="transparent" />
        <stop offset="0.8" stopColor="rgba(255, 255, 255, 0.1)" />
        <stop offset="1" stopColor="rgba(220, 214, 247, 0.4)" />
      </radialGradient>

      <filter id="bhBlur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
      </filter>
    </defs>

    {/* Gravitational Lensing Halo */}
    <circle cx="32" cy="32" r="30" fill="url(#lensingGlow)" className="animate-pulse-slow" />

    {/* Primary Accretion Disk (Warped Ring) */}
    <g filter="url(#bhBlur)" className="bh-rings-container">
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke="url(#accretionDiskPrimary)"
        strokeWidth="3"
        strokeLinecap="round"
        className="bh-ring-primary"
      />
      {/* Secondary Distant Ring Segment */}
      <circle
        cx="32"
        cy="32"
        r="22"
        fill="none"
        stroke="rgba(220, 214, 247, 0.2)"
        strokeWidth="1"
        strokeDasharray="15 25"
        className="bh-ring-secondary"
      />
    </g>

    {/* Photon Sphere High-intensity Edge */}
    <circle cx="32" cy="32" r="14.5" fill="none" stroke="url(#photonSphere)" strokeWidth="0.5" />

    {/* Black Hole Core (Event Horizon) */}
    <circle cx="32" cy="32" r="12" fill="url(#eventHorizon)" />

    {/* Emission Jets / Sparkles */}
    <circle cx="12" cy="12" r="0.8" fill="#dcd6f7" className="animate-twinkle" />
    <circle cx="52" cy="20" r="0.6" fill="#c2efb3" className="animate-twinkle" />
    <circle cx="48" cy="52" r="1" fill="#fff" className="animate-twinkle" />
  </svg>
);

export default SolarCoreIcon;
