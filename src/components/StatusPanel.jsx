export default function StatusPanel({
  turn,
  evidenceExamined,
  verdictUnlocked,
  onVerdict,
  loading,
  voiceEnabled,
  autoNarrate,
  isSpeaking,
  onToggleVoice,
  onToggleNarrate,
  onStopSpeaking,
  speechSupported,
}) {
  return (
    <div className="bg-charcoal-800/90 border-l border-charcoal-700 p-4 flex flex-col gap-4 overflow-y-auto">
      {/* Turn Counter */}
      <div className="text-center">
        <div className="text-cream-dim/50 font-crimson text-xs uppercase tracking-wider mb-1">Turn</div>
        <div className={`font-playfair text-4xl font-bold ${verdictUnlocked ? 'text-gold animate-pulse-gold rounded-full inline-block px-4 py-1' : 'text-cream'}`}>
          {turn || '—'}
        </div>
        {verdictUnlocked && (
          <div className="text-gold/70 text-xs font-crimson mt-1 animate-fade-in">
            Verdict unlocked
          </div>
        )}
      </div>

      <div className="w-full h-px bg-charcoal-600" />

      {/* Verdict Buttons */}
      <div>
        <div className="text-cream-dim/50 font-crimson text-xs uppercase tracking-wider mb-2">Verdict</div>
        <div className="space-y-2">
          <button
            onClick={() => onVerdict('guilty')}
            disabled={loading}
            className={`w-full py-2 rounded font-playfair text-sm uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
              verdictUnlocked
                ? 'bg-blood/20 border border-blood text-blood hover:bg-blood/30'
                : 'bg-charcoal-700/30 border border-charcoal-600 text-charcoal-600 cursor-not-allowed'
            }`}
          >
            Guilty
          </button>
          <button
            onClick={() => onVerdict('not guilty')}
            disabled={loading}
            className={`w-full py-2 rounded font-playfair text-sm uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
              verdictUnlocked
                ? 'bg-verdict-green/20 border border-verdict-green text-verdict-green hover:bg-verdict-green/30'
                : 'bg-charcoal-700/30 border border-charcoal-600 text-charcoal-600 cursor-not-allowed'
            }`}
          >
            Not Guilty
          </button>
        </div>
        {!verdictUnlocked && turn > 0 && (
          <p className="text-charcoal-600 text-xs font-crimson mt-1.5 text-center italic">
            Unlocks at Turn 4
          </p>
        )}
      </div>

      <div className="w-full h-px bg-charcoal-600" />

      {/* Evidence Tracker */}
      <div>
        <div className="text-cream-dim/50 font-crimson text-xs uppercase tracking-wider mb-2">Evidence Examined</div>
        {evidenceExamined.length > 0 ? (
          <ul className="space-y-1">
            {evidenceExamined.map((ev, i) => (
              <li key={i} className="text-cream-dim font-crimson text-xs flex items-center gap-1.5">
                <span className="text-gold">&#9670;</span> {ev}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-charcoal-600 text-xs font-crimson italic">None yet</p>
        )}
      </div>

      <div className="w-full h-px bg-charcoal-600" />

      {/* Voice Controls */}
      {speechSupported && (
        <div>
          <div className="text-cream-dim/50 font-crimson text-xs uppercase tracking-wider mb-2">Voice</div>
          <div className="space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-cream-dim text-xs font-crimson">Voice input</span>
              <button
                onClick={onToggleVoice}
                className={`w-10 h-5 rounded-full transition-colors relative ${voiceEnabled ? 'bg-gold/40' : 'bg-charcoal-600'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${voiceEnabled ? 'translate-x-5 bg-gold' : 'translate-x-0.5 bg-charcoal-700'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-cream-dim text-xs font-crimson">Auto-narrate</span>
              <button
                onClick={onToggleNarrate}
                className={`w-10 h-5 rounded-full transition-colors relative ${autoNarrate ? 'bg-gold/40' : 'bg-charcoal-600'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${autoNarrate ? 'translate-x-5 bg-gold' : 'translate-x-0.5 bg-charcoal-700'}`} />
              </button>
            </label>
            {isSpeaking && (
              <button
                onClick={onStopSpeaking}
                className="w-full py-1.5 bg-blood/20 border border-blood/40 text-blood text-xs font-crimson rounded hover:bg-blood/30 transition-all cursor-pointer"
              >
                Stop Narration
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
