export default function VerdictModal({ verdict, onConfirm, onCancel, verdictUnlocked }) {
  const isGuilty = verdict === 'guilty';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-charcoal-900/90" />
      <div
        className="relative bg-charcoal-800 border-2 rounded-lg max-w-sm w-full p-6 animate-fade-in text-center"
        style={{ borderColor: isGuilty ? '#8b1a1a' : '#2a6b3a' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gavel icon */}
        <div className="text-4xl mb-3 animate-gavel inline-block">&#9878;</div>

        <h2 className="font-playfair text-xl text-cream mb-2">
          Deliver Your Verdict?
        </h2>

        <p className={`font-playfair text-2xl font-bold uppercase tracking-wider mb-4 ${isGuilty ? 'text-blood' : 'text-verdict-green'}`}>
          {verdict}
        </p>

        {!verdictUnlocked && (
          <div className="bg-blood/10 border border-blood/30 rounded p-3 mb-4 animate-fade-in">
            <p className="text-blood font-crimson text-sm">
              Warning: You haven't reached Turn 4. Delivering now will result in automatic removal from the bench.
            </p>
          </div>
        )}

        <p className="text-cream-dim/70 font-crimson text-sm mb-6 italic">
          This cannot be undone. The truth will be revealed.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-charcoal-700 border border-charcoal-600 text-cream-dim font-crimson text-sm rounded hover:bg-charcoal-600 transition-all cursor-pointer"
          >
            Reconsider
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded font-playfair text-sm uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
              isGuilty
                ? 'bg-blood/20 border border-blood text-blood hover:bg-blood/30'
                : 'bg-verdict-green/20 border border-verdict-green text-verdict-green hover:bg-verdict-green/30'
            }`}
          >
            Deliver Verdict
          </button>
        </div>
      </div>
    </div>
  );
}
