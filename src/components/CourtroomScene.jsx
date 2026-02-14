import { useMemo } from 'react';

// SVG courtroom character silhouettes with comic book styling
// These update dynamically based on scene state from the AI

const MOOD_COLORS = {
  tense: '#c9a227',
  dramatic: '#8b1a1a',
  calm: '#4a6741',
  angry: '#a83232',
  fearful: '#6b5b3a',
  confident: '#c9a227',
  suspicious: '#7a5c2e',
  shocked: '#d4cfc5',
  sad: '#3a4a6b',
  neutral: '#5a5a5a',
};

const MOOD_BG = {
  tense: 'linear-gradient(180deg, #1a1a0d 0%, #0d0d0d 100%)',
  dramatic: 'linear-gradient(180deg, #1a0d0d 0%, #0d0d0d 100%)',
  calm: 'linear-gradient(180deg, #0d1a0d 0%, #0d0d0d 100%)',
  angry: 'linear-gradient(180deg, #2a0d0d 0%, #0d0d0d 100%)',
  fearful: 'linear-gradient(180deg, #1a1a0d 0%, #0d0d0d 100%)',
  confident: 'linear-gradient(180deg, #1a1a0d 0%, #0d0d0d 100%)',
  suspicious: 'linear-gradient(180deg, #1a150d 0%, #0d0d0d 100%)',
  shocked: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
  sad: 'linear-gradient(180deg, #0d0d1a 0%, #0d0d0d 100%)',
  neutral: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
};

function JudgeFigure({ mood, speaking }) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  return (
    <g transform="translate(180, 30)">
      {/* Bench */}
      <rect x="-60" y="60" width="120" height="50" fill="#2a2018" stroke={color} strokeWidth="2" />
      <rect x="-70" y="55" width="140" height="10" fill="#3a2a18" stroke={color} strokeWidth="1.5" />
      {/* Figure */}
      <circle cx="0" cy="25" r="18" fill="#1a1a1a" stroke={color} strokeWidth="2.5" />
      {/* Robe */}
      <path d="M-20,43 Q0,38 20,43 L25,95 Q0,100 -25,95 Z" fill="#1a1a1a" stroke={color} strokeWidth="2" />
      {/* Gavel */}
      <rect x="30" y="50" width="25" height="8" rx="2" fill="#5a3a1a" stroke={color} strokeWidth="1.5"
        className={speaking ? 'animate-gavel' : ''} style={{ transformOrigin: '42px 54px' }} />
      {speaking && <circle cx="0" cy="25" r="22" fill="none" stroke={color} strokeWidth="1" opacity="0.5">
        <animate attributeName="r" values="22;28;22" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
      </circle>}
    </g>
  );
}

function WitnessFigure({ mood, speaking, x = 0 }) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  return (
    <g transform={`translate(${x}, 40)`}>
      {/* Stand */}
      <rect x="-25" y="55" width="50" height="45" fill="#2a2018" stroke={color} strokeWidth="1.5" />
      <rect x="-30" y="50" width="60" height="8" fill="#3a2a18" stroke={color} strokeWidth="1" />
      {/* Figure */}
      <circle cx="0" cy="22" r="15" fill="#1a1a1a" stroke={color} strokeWidth="2" />
      {/* Body */}
      <path d="M-15,37 Q0,33 15,37 L18,80 Q0,85 -18,80 Z" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
      {/* Speaking indicator */}
      {speaking && <>
        <line x1="20" y1="15" x2="35" y2="5" stroke={color} strokeWidth="1.5" />
        <line x1="20" y1="22" x2="38" y2="22" stroke={color} strokeWidth="1.5" />
        <line x1="20" y1="29" x2="35" y2="39" stroke={color} strokeWidth="1.5" />
      </>}
    </g>
  );
}

function LawyerFigure({ side, mood, speaking }) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  const x = side === 'prosecution' ? 80 : 280;
  const flip = side === 'defense' ? -1 : 1;
  return (
    <g transform={`translate(${x}, 50)`}>
      {/* Table */}
      <rect x="-30" y="50" width="60" height="8" fill="#2a2018" stroke={color} strokeWidth="1" />
      <rect x="-25" y="58" width="50" height="30" fill="#2a2018" stroke={color} strokeWidth="1" />
      {/* Figure standing */}
      <circle cx={flip * 5} cy="15" r="13" fill="#1a1a1a" stroke={color} strokeWidth="2" />
      <path d={`M${flip * 5 - 12},28 Q${flip * 5},25 ${flip * 5 + 12},28 L${flip * 5 + 15},75 Q${flip * 5},78 ${flip * 5 - 15},75 Z`}
        fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
      {/* Papers on table */}
      <rect x="-20" y="42" width="15" height="10" fill="#f5f0e6" opacity="0.3" transform={`rotate(${flip * -5})`} />
      {speaking && <circle cx={flip * 5} cy="15" r="18" fill="none" stroke={color} strokeWidth="1" opacity="0.4">
        <animate attributeName="r" values="18;24;18" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
      </circle>}
    </g>
  );
}

function JuryBox({ mood }) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  return (
    <g transform="translate(320, 55)">
      {/* Box */}
      <rect x="0" y="10" width="55" height="40" fill="#1a1a1a" stroke={color} strokeWidth="1.5" rx="2" />
      {/* Juror heads */}
      {[8, 22, 36].map((cx, i) => (
        <g key={i}>
          <circle cx={cx + 5} cy="5" r="7" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
          <circle cx={cx + 5} cy="30" r="7" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
        </g>
      ))}
    </g>
  );
}

function EvidencePanel({ evidence, mood }) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  if (!evidence || evidence === 'none') return null;
  return (
    <g transform="translate(140, 110)">
      {/* Evidence table */}
      <rect x="0" y="0" width="80" height="50" fill="#2a2018" stroke={color} strokeWidth="2" rx="2" />
      {/* Document/item */}
      <rect x="10" y="5" width="25" height="35" fill="#f5f0e6" opacity="0.6" rx="1" stroke={color} strokeWidth="1" />
      <line x1="14" y1="12" x2="31" y2="12" stroke={color} strokeWidth="0.5" opacity="0.4" />
      <line x1="14" y1="17" x2="28" y2="17" stroke={color} strokeWidth="0.5" opacity="0.4" />
      <line x1="14" y1="22" x2="30" y2="22" stroke={color} strokeWidth="0.5" opacity="0.4" />
      {/* Magnifying glass */}
      <circle cx="55" cy="18" r="10" fill="none" stroke={color} strokeWidth="2" />
      <line x1="62" y1="25" x2="70" y2="33" stroke={color} strokeWidth="2.5" />
      {/* Glow effect */}
      <circle cx="55" cy="18" r="14" fill="none" stroke={color} strokeWidth="1" opacity="0.3">
        <animate attributeName="r" values="14;18;14" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function SpeedLines({ mood }) {
  if (!['dramatic', 'shocked', 'angry'].includes(mood)) return null;
  const color = MOOD_COLORS[mood];
  return (
    <g opacity="0.15">
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30) * Math.PI / 180;
        const x1 = 190 + Math.cos(angle) * 80;
        const y1 = 80 + Math.sin(angle) * 60;
        const x2 = 190 + Math.cos(angle) * 200;
        const y2 = 80 + Math.sin(angle) * 150;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" />;
      })}
    </g>
  );
}

export default function CourtroomScene({ scene, loading }) {
  const mood = scene?.mood || 'neutral';
  const speaker = scene?.speaker?.toLowerCase() || 'narrator';
  const location = scene?.location || 'courtroom_wide';
  const evidence = scene?.evidence || 'none';

  const bgStyle = useMemo(() => ({
    background: MOOD_BG[mood] || MOOD_BG.neutral,
  }), [mood]);

  return (
    <div className="comic-panel w-full" style={{ ...bgStyle, minHeight: '180px' }}>
      {/* Caption bar */}
      {scene?.speaker && scene.speaker !== 'narrator' && (
        <div className="absolute top-2 left-2 z-10">
          <div className="speech-bubble text-xs px-2 py-1" style={{ fontSize: '11px' }}>
            {scene.speaker} speaks...
          </div>
        </div>
      )}

      {/* Location label */}
      <div className="absolute top-2 right-2 z-10 bg-charcoal-900/80 px-2 py-0.5 border border-gold/30 text-gold text-xs font-playfair uppercase tracking-wider">
        {location.replace(/_/g, ' ')}
      </div>

      {/* SVG Scene */}
      <svg viewBox="0 0 400 170" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Halftone pattern */}
        <defs>
          <pattern id="halftone" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.5" fill="rgba(201,162,39,0.05)" />
          </pattern>
        </defs>
        <rect width="400" height="170" fill="url(#halftone)" />

        {/* Speed lines for dramatic moments */}
        <SpeedLines mood={mood} />

        {/* Court elements based on location */}
        <JudgeFigure mood={mood} speaking={speaker === 'narrator' || location === 'judge_bench'} />
        <LawyerFigure side="prosecution" mood={mood} speaking={speaker !== 'narrator' && location !== 'witness_stand'} />
        <LawyerFigure side="defense" mood={mood} speaking={false} />

        {location === 'witness_stand' || speaker !== 'narrator' ? (
          <WitnessFigure mood={mood} speaking={location === 'witness_stand'} x={180} />
        ) : null}

        <JuryBox mood={mood} />
        <EvidencePanel evidence={evidence} mood={mood} />
      </svg>

      {/* Mood indicator strip */}
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: MOOD_COLORS[mood] || '#5a5a5a', opacity: 0.6 }} />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-charcoal-900/60">
          <div className="text-gold font-playfair text-sm animate-pulse">The court deliberates...</div>
        </div>
      )}
    </div>
  );
}
