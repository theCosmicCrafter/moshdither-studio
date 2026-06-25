/**
 * Procedural graffiti-style background for the empty preview state.
 * Renders as an inline SVG so it works offline inside the Tauri desktop app.
 */
export default function GraffitiBackground() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none z-0"
      style={{
        background:
          "radial-gradient(ellipse at 20% 30%, rgba(255,173,224,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(184,211,0,0.10) 0%, transparent 55%), radial-gradient(ellipse at 50% 50%, rgba(0,244,254,0.08) 0%, transparent 60%), #0a0a0a",
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 800 600"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="spray" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffade0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff4d00" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="grad2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f4fe" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#7d00ff" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="grad3" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b8d300" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#00ff9f" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Spray paint blobs */}
        <g filter="url(#spray)" opacity="0.7">
          <ellipse cx="150" cy="120" rx="120" ry="70" fill="url(#grad1)" transform="rotate(-15 150 120)" />
          <ellipse cx="650" cy="480" rx="140" ry="85" fill="url(#grad2)" transform="rotate(10 650 480)" />
          <ellipse cx="720" cy="140" rx="90" ry="55" fill="url(#grad3)" transform="rotate(-8 720 140)" />
          <ellipse cx="80" cy="520" rx="100" ry="60" fill="url(#grad1)" transform="rotate(20 80 520)" />
          <ellipse cx="400" cy="300" rx="180" ry="110" fill="url(#grad2)" opacity="0.35" transform="rotate(5 400 300)" />
        </g>

        {/* Drips */}
        <g opacity="0.6">
          <path d="M180 170 Q185 250 182 300 Q178 340 185 360" stroke="#ffade0" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M670 530 Q675 580 672 610" stroke="#00f4fe" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M740 180 Q745 240 738 280" stroke="#b8d300" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>

        {/* Graffiti tag strokes */}
        <g fill="none" strokeWidth="6" strokeLinecap="round" opacity="0.8">
          <path d="M250 450 Q320 380 380 430 T500 420" stroke="#ffade0" />
          <path d="M520 150 Q580 100 640 160 T760 130" stroke="#00f4fe" />
          <path d="M120 250 Q180 200 240 260 T360 230" stroke="#b8d300" />
        </g>

        {/* Halftone dots */}
        <g opacity="0.25">
          {Array.from({ length: 12 }).map((_, i) =>
            Array.from({ length: 9 }).map((_, j) => (
              <circle
                key={`${i}-${j}`}
                cx={i * 70 + 35}
                cy={j * 70 + 35}
                r={3 + Math.random() * 4}
                fill="#fff"
              />
            ))
          )}
        </g>
      </svg>
    </div>
  );
}
