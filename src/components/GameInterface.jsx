import { useState, useCallback, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import StatusPanel from './StatusPanel';
import CourtroomScene from './CourtroomScene';

export default function GameInterface({
  messages, turn, evidenceExamined, loading, error, scene,
  verdictUnlocked, onAction, onVerdict, onQuit,
  voice,
}) {
  const [customInput, setCustomInput] = useState('');
  const [showStatus, setShowStatus] = useState(false);

  // Auto-narrate new assistant messages
  useEffect(() => {
    if (!voice.autoNarrate || loading) return;
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      voice.speak(last.text);
    }
  }, [messages.length]);

  const handleSelectAction = useCallback((text) => {
    if (loading) return;
    onAction(text);
  }, [loading, onAction]);

  const handleCustomSubmit = useCallback((e) => {
    e.preventDefault();
    if (!customInput.trim() || loading) return;
    onAction(customInput.trim());
    setCustomInput('');
  }, [customInput, loading, onAction]);

  const handleVoiceInput = useCallback(async () => {
    if (voice.isListening) {
      voice.stopListening();
      return;
    }
    const result = await voice.startListening();
    if (result?.trim()) {
      onAction(result.trim());
    }
  }, [voice, onAction]);

  return (
    <div className="h-screen flex flex-col bg-charcoal-900">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-charcoal-800 border-b border-charcoal-700">
        <button
          onClick={onQuit}
          className="text-charcoal-600 hover:text-cream-dim font-crimson text-sm transition-colors cursor-pointer"
        >
          &larr; Leave Court
        </button>
        <h1 className="font-playfair text-sm text-gold tracking-wider uppercase">The Trial</h1>
        <button
          onClick={() => setShowStatus(!showStatus)}
          className="md:hidden text-charcoal-600 hover:text-cream-dim font-crimson text-sm transition-colors cursor-pointer"
        >
          {showStatus ? 'Chat' : `Turn ${turn || '—'}`}
        </button>
      </div>

      {/* Comic panel scene */}
      <CourtroomScene scene={scene} loading={loading} />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat area */}
        <div className={`flex-1 flex flex-col ${showStatus ? 'hidden md:flex' : 'flex'}`}>
          <ChatPanel
            messages={messages}
            loading={loading}
            onSelectAction={handleSelectAction}
          />

          {/* Input bar */}
          <div className="border-t border-charcoal-700 p-3 bg-charcoal-800">
            {error && (
              <div className="text-blood text-xs font-crimson mb-2 animate-fade-in">{error}</div>
            )}
            <form onSubmit={handleCustomSubmit} className="flex gap-2">
              {/* Voice input button */}
              {voice.speechRecognitionSupported && voice.voiceEnabled && (
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                    voice.isListening
                      ? 'voice-active border-blood text-cream'
                      : 'border-charcoal-600 text-charcoal-600 hover:border-gold hover:text-gold'
                  }`}
                  title={voice.isListening ? 'Stop listening' : 'Speak your action'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              )}

              <input
                type="text"
                value={voice.isListening ? voice.transcript : customInput}
                onChange={e => setCustomInput(e.target.value)}
                placeholder={voice.isListening ? 'Listening...' : 'Type a custom action...'}
                disabled={loading || voice.isListening}
                className="flex-1 bg-charcoal-900 border border-charcoal-600 rounded px-3 py-2 text-cream text-sm font-crimson placeholder:text-charcoal-600 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={loading || voice.isListening}
                className="px-4 py-2 bg-gold/10 border border-gold/30 text-gold font-crimson text-sm rounded hover:bg-gold/20 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Act
              </button>
            </form>
          </div>
        </div>

        {/* Status panel - always visible on desktop, togglable on mobile */}
        <div className={`w-56 shrink-0 ${showStatus ? 'block' : 'hidden md:block'}`}>
          <StatusPanel
            turn={turn}
            evidenceExamined={evidenceExamined}
            verdictUnlocked={verdictUnlocked}
            onVerdict={onVerdict}
            loading={loading}
            voiceEnabled={voice.voiceEnabled}
            autoNarrate={voice.autoNarrate}
            isSpeaking={voice.isSpeaking}
            onToggleVoice={voice.toggleVoice}
            onToggleNarrate={voice.toggleAutoNarrate}
            onStopSpeaking={voice.stopSpeaking}
            speechSupported={voice.speechRecognitionSupported || voice.speechSynthesisSupported}
          />
        </div>
      </div>
    </div>
  );
}
