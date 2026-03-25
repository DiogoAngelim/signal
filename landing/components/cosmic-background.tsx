"use client";

export function CosmicBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* SVG Noise Texture */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="noise" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(28,57,110,0.14)_0%,transparent_60%)] blur-3xl" />
      <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(223,114,71,0.1)_0%,transparent_60%)] blur-3xl animate-pulse-glow" />
      <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-[radial-gradient(circle,rgba(147,48,38,0.08)_0%,transparent_60%)] blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(12,10,23,0.34)_0%,transparent_60%)] blur-2xl" />

      {/* Flowing energy lines - decorative SVG */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lineGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(223,114,71,0)" />
            <stop offset="50%" stopColor="rgba(223,114,71,0.3)" />
            <stop offset="100%" stopColor="rgba(223,114,71,0)" />
          </linearGradient>
          <linearGradient id="lineGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(39,102,166,0)" />
            <stop offset="50%" stopColor="rgba(39,102,166,0.22)" />
            <stop offset="100%" stopColor="rgba(39,102,166,0)" />
          </linearGradient>
        </defs>
        <path
          d="M0,300 Q200,200 400,350 T800,250 T1200,400 T1600,300"
          fill="none"
          stroke="url(#lineGrad1)"
          strokeWidth="1"
          className="animate-neural"
          style={{ animationDelay: "0s" }}
        />
        <path
          d="M0,500 Q300,400 600,550 T1000,450 T1400,600"
          fill="none"
          stroke="url(#lineGrad2)"
          strokeWidth="1"
          className="animate-neural"
          style={{ animationDelay: "1.5s" }}
        />
      </svg>
    </div>
  );
}
