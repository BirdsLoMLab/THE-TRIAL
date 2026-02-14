function ScoreBar({ label, score, max, color }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-cream-dim font-crimson text-sm">{label}</span>
        <span className="text-gold font-playfair text-sm font-bold">{score}/{max}</span>
      </div>
      <div className="h-2 bg-charcoal-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function ResultsPage({ verdictResult, lastNarration, onPlayAgain }) {
  if (!verdictResult) return null;

  const { correct, score, label, timing, evidence, deception, cognitive } = verdictResult;

  const labelColor = score >= 85 ? '#c9a227' : score >= 70 ? '#d4cfc5' : score >= 50 ? '#a88620' : '#8b1a1a';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal-900 via-charcoal-800 to-charcoal-900" />
      <div className="absolute inset-0 halftone-overlay opacity-20" />

      <div className="relative z-10 max-w-lg w-full">
        {/* Verdict result */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="text-6xl mb-3">{correct ? '&#9878;' : '&#9888;'}</div>
          <h1 className={`font-playfair text-3xl font-bold uppercase tracking-wider ${correct ? 'text-verdict-green' : 'text-blood'}`}>
            {correct ? 'Correct Verdict' : 'Wrong Verdict'}
          </h1>
          <div className="w-24 h-0.5 mx-auto mt-3 mb-2" style={{ backgroundColor: correct ? '#2a6b3a' : '#8b1a1a' }} />
        </div>

        {/* Score */}
        <div className="text-center mb-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="font-playfair text-6xl font-bold" style={{ color: labelColor }}>
            {score}
          </div>
          <div className="font-playfair text-lg mt-1" style={{ color: labelColor }}>
            {label}
          </div>
        </div>

        {/* Score breakdown */}
        <div className="bg-charcoal-800/80 border border-charcoal-600 rounded-lg p-5 mb-6 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <h3 className="font-playfair text-sm text-cream-dim/50 uppercase tracking-wider mb-4">Score Breakdown</h3>
          <ScoreBar label="Timing" score={timing} max={30} color="#c9a227" />
          <ScoreBar label="Evidence" score={evidence} max={30} color="#4a8b5a" />
          <ScoreBar label="Deception" score={deception} max={20} color="#8b4a4a" />
          <ScoreBar label="Cognitive" score={cognitive} max={20} color="#4a6b8b" />
        </div>

        {/* Case explanation */}
        {lastNarration && (
          <div className="bg-charcoal-800/80 border border-charcoal-600 rounded-lg p-5 mb-6 animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <h3 className="font-playfair text-sm text-cream-dim/50 uppercase tracking-wider mb-3">The Truth</h3>
            <div className="text-cream-dim font-crimson text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {lastNarration}
            </div>
          </div>
        )}

        {/* Play again */}
        <button
          onClick={onPlayAgain}
          className="w-full py-4 bg-gold/10 border-2 border-gold text-gold font-playfair text-lg tracking-wider uppercase hover:bg-gold/20 transition-all rounded cursor-pointer active:scale-95 animate-fade-in"
          style={{ animationDelay: '0.8s' }}
        >
          Try Another Case
        </button>
      </div>
    </div>
  );
}
