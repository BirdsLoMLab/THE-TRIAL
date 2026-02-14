import { useEffect, useRef } from 'react';

function NarrationMessage({ text }) {
  // Render markdown-ish text with basic formatting
  const renderText = (raw) => {
    return raw
      .split('\n')
      .map((line, i) => {
        // Bold
        let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-cream font-semibold">$1</strong>');
        // Italic
        processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Turn marker styling
        processed = processed.replace(
          /\[Turn\s+(\d+)\]/gi,
          '<span class="text-gold font-playfair font-bold">[Turn $1]</span>'
        );
        if (!processed.trim()) return <br key={i} />;
        return <p key={i} className="mb-1.5" dangerouslySetInnerHTML={{ __html: processed }} />;
      });
  };

  return (
    <div className="animate-fade-in">
      <div className="text-cream-dim font-crimson text-sm leading-relaxed whitespace-pre-wrap">
        {renderText(text)}
      </div>
    </div>
  );
}

function ActionOptions({ options, onSelect, disabled }) {
  if (!options?.length) return null;
  return (
    <div className="mt-3 space-y-2 animate-fade-in">
      {options.map((opt) => (
        <button
          key={opt.number}
          onClick={() => onSelect(opt.text)}
          disabled={disabled}
          className="w-full text-left px-4 py-2.5 bg-charcoal-700/50 border border-charcoal-600 rounded text-cream-dim font-crimson text-sm hover:border-gold/40 hover:text-gold hover:bg-charcoal-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          <span className="text-gold font-playfair mr-2">{opt.number}.</span>
          {opt.text}
        </button>
      ))}
    </div>
  );
}

function PlayerMessage({ text }) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-2 max-w-[85%]">
        <p className="text-gold font-crimson text-sm">{text}</p>
      </div>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2 py-3 animate-fade-in">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-gold/60"
            style={{
              animation: 'pulse-gold 1.5s infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <span className="text-cream-dim/50 font-crimson text-xs italic">The court stirs...</span>
    </div>
  );
}

export default function ChatPanel({ messages, loading, onSelectAction, onCustomAction }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {messages.map((msg, i) => {
        if (msg.role === 'user') {
          return <PlayerMessage key={i} text={msg.text} />;
        }
        const isLast = i === messages.length - 1;
        return (
          <div key={i}>
            <NarrationMessage text={msg.text} />
            {isLast && !loading && (
              <ActionOptions
                options={msg.options}
                onSelect={onSelectAction}
                disabled={loading}
              />
            )}
          </div>
        );
      })}
      {loading && <LoadingIndicator />}
    </div>
  );
}
