import { useState, useEffect } from 'react';

export default function LandingPage({ onStart, setApiKey, getApiKey, error, setError, onShowRules }) {
  const [key, setKey] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const stored = getApiKey();
    if (stored) {
      setKey(stored);
      setKeySaved(true);
    }
  }, [getApiKey]);

  const handleSaveKey = () => {
    if (!key.trim()) {
      setError('Please enter a valid API key.');
      return;
    }
    setApiKey(key.trim());
    setKeySaved(true);
    setError(null);
  };

  const handleStart = () => {
    if (!key.trim()) {
      setError('You need a Claude API key to play. Tap "Get API Key" for instructions.');
      return;
    }
    setApiKey(key.trim());
    onStart();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal-900 via-charcoal-800 to-charcoal-900" />
      <div className="absolute inset-0 halftone-overlay opacity-30" />

      {/* Vignette */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
      }} />

      <div className="relative z-10 text-center max-w-lg w-full">
        {/* Title */}
        <div className="mb-2">
          <div className="text-gold/60 font-crimson text-sm tracking-[0.3em] uppercase mb-3">
            A Courtroom Simulation
          </div>
          <h1 className="font-playfair text-6xl md:text-8xl font-bold text-cream tracking-tight leading-none">
            THE
          </h1>
          <h1 className="font-playfair text-6xl md:text-8xl font-bold text-gold tracking-tight leading-none mt-1">
            TRIAL
          </h1>
          <div className="w-32 h-0.5 bg-gold/40 mx-auto mt-4 mb-3" />
          <p className="text-cream-dim font-crimson text-lg italic">
            "Every judgment carries weight. Every silence speaks."
          </p>
        </div>

        {/* API Key Section */}
        <div className="mt-10 bg-charcoal-800/80 border border-charcoal-600 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-cream text-sm font-playfair tracking-wide">
              Claude API Key
            </label>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-gold text-xs hover:text-gold-dim transition-colors underline underline-offset-2 cursor-pointer"
            >
              {showInstructions ? 'Hide instructions' : 'Get API Key'}
            </button>
          </div>

          {showInstructions && (
            <div className="mb-4 bg-charcoal-900/80 border border-gold/20 rounded p-4 text-left animate-fade-in">
              <p className="text-gold font-playfair text-sm font-semibold mb-2">How to get your API key:</p>
              <ol className="text-cream-dim text-sm space-y-1.5 list-decimal list-inside font-crimson">
                <li>Go to <span className="text-gold">console.anthropic.com</span></li>
                <li>Create an account or sign in</li>
                <li>Navigate to <span className="text-gold">Settings &rarr; API Keys</span></li>
                <li>Click <span className="text-gold">"Create Key"</span></li>
                <li>Copy and paste it below</li>
              </ol>
              <p className="text-cream-dim/60 text-xs mt-3 italic">
                Your key stays on your device. It's stored in your browser and never sent anywhere except Anthropic's API.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setKeySaved(false); }}
              placeholder="sk-ant-..."
              className="flex-1 bg-charcoal-900 border border-charcoal-600 rounded px-3 py-2 text-cream text-sm font-mono placeholder:text-charcoal-600 focus:outline-none focus:border-gold/50 transition-colors"
            />
            <button
              onClick={handleSaveKey}
              className={`px-4 py-2 rounded text-sm font-playfair transition-all cursor-pointer ${
                keySaved
                  ? 'bg-verdict-green/30 border border-verdict-green text-verdict-green'
                  : 'bg-gold/20 border border-gold/40 text-gold hover:bg-gold/30'
              }`}
            >
              {keySaved ? 'Saved' : 'Save'}
            </button>
          </div>

          {error && (
            <p className="text-blood text-sm mt-2 animate-fade-in">{error}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 space-y-3">
          <button
            onClick={handleStart}
            className="w-full py-4 bg-gold/10 border-2 border-gold text-gold font-playfair text-xl tracking-wider uppercase hover:bg-gold/20 transition-all rounded cursor-pointer active:scale-95"
          >
            Enter the Courtroom
          </button>
          <button
            onClick={onShowRules}
            className="w-full py-2.5 bg-transparent border border-charcoal-600 text-cream-dim font-crimson text-sm hover:border-cream-dim/40 transition-all rounded cursor-pointer"
          >
            How to Play
          </button>
        </div>

        {/* Footer */}
        <p className="mt-8 text-charcoal-600 text-xs font-crimson">
          Powered by Claude AI &middot; Each case is unique
        </p>
      </div>
    </div>
  );
}
