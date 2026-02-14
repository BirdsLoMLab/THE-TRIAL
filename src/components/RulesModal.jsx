export default function RulesModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-charcoal-900/90" />
      <div
        className="relative bg-charcoal-800 border-2 border-gold/30 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-playfair text-2xl text-gold mb-4 text-center">How to Play</h2>
        <div className="w-16 h-0.5 bg-gold/30 mx-auto mb-5" />

        <div className="space-y-4 text-cream-dim font-crimson text-sm leading-relaxed">
          <section>
            <h3 className="text-cream font-playfair text-base mb-1">Your Role</h3>
            <p>You are the presiding judge. A defendant sits before you, accused of a crime. The truth is hidden. It's your job to find it.</p>
          </section>

          <section>
            <h3 className="text-cream font-playfair text-base mb-1">Each Turn</h3>
            <p>Choose <strong className="text-gold">one action</strong>: question a witness, interrogate the defendant, examine evidence, or observe the courtroom. The AI narrates what happens.</p>
          </section>

          <section>
            <h3 className="text-cream font-playfair text-base mb-1">Your Verdict</h3>
            <p>At <strong className="text-gold">Turn 4</strong>, the verdict buttons unlock. You may deliver your verdict at any point after. Rushing means less evidence. Waiting too long costs timing points.</p>
            <p className="mt-1 text-blood italic">Delivering a verdict before Turn 4 results in automatic removal from the bench.</p>
          </section>

          <section>
            <h3 className="text-cream font-playfair text-base mb-1">Scoring (0-100)</h3>
            <ul className="space-y-1 ml-3">
              <li><span className="text-gold">Timing</span> (30 pts) &mdash; Earlier is better, but not too early</li>
              <li><span className="text-gold">Evidence</span> (30 pts) &mdash; +10 per critical evidence examined</li>
              <li><span className="text-gold">Deception</span> (20 pts) &mdash; Catching lies vs. being fooled</li>
              <li><span className="text-gold">Cognitive</span> (20 pts) &mdash; Adapting to contradictions</li>
            </ul>
          </section>

          <section>
            <h3 className="text-cream font-playfair text-base mb-1">Score Labels</h3>
            <ul className="space-y-0.5 ml-3 text-xs">
              <li><span className="text-gold">100</span> &mdash; Elite Judge</li>
              <li><span className="text-gold">85-99</span> &mdash; Excellent Judgment</li>
              <li><span className="text-gold">70-84</span> &mdash; Competent but Vulnerable</li>
              <li><span className="text-gold">50-69</span> &mdash; Poor Under Pressure</li>
              <li><span className="text-blood">Below 50</span> &mdash; Dangerous Judge</li>
            </ul>
          </section>

          <section>
            <h3 className="text-cream font-playfair text-base mb-1">Voice Controls</h3>
            <p>Tap the <strong className="text-gold">microphone</strong> button to speak your actions. The game will narrate responses aloud automatically. Toggle voice in the settings.</p>
          </section>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 bg-gold/10 border border-gold/40 text-gold font-playfair text-sm rounded hover:bg-gold/20 transition-all cursor-pointer"
        >
          Understood, Your Honor
        </button>
      </div>
    </div>
  );
}
