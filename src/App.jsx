import { useState } from 'react';
import { useGameState, PHASES } from './hooks/useGameState';
import { useVoice } from './hooks/useVoice';
import LandingPage from './components/LandingPage';
import GameInterface from './components/GameInterface';
import VerdictModal from './components/VerdictModal';
import ResultsPage from './components/ResultsPage';
import RulesModal from './components/RulesModal';

export default function App() {
  const game = useGameState();
  const voice = useVoice();
  const [showRules, setShowRules] = useState(false);

  const lastNarration = game.messages.length > 0
    ? game.messages[game.messages.length - 1]?.text
    : '';

  return (
    <div className="min-h-screen bg-charcoal-900">
      {game.phase === PHASES.LANDING && (
        <LandingPage
          onStart={game.startGame}
          setApiKey={game.setApiKey}
          getApiKey={game.getApiKey}
          error={game.error}
          setError={game.setError}
          onShowRules={() => setShowRules(true)}
        />
      )}

      {(game.phase === PHASES.PLAYING || game.phase === PHASES.VERDICT_CONFIRM) && (
        <GameInterface
          messages={game.messages}
          turn={game.turn}
          evidenceExamined={game.evidenceExamined}
          loading={game.loading}
          error={game.error}
          scene={game.scene}
          verdictUnlocked={game.verdictUnlocked}
          onAction={game.sendAction}
          onVerdict={game.requestVerdict}
          onQuit={game.resetGame}
          voice={voice}
        />
      )}

      {game.phase === PHASES.VERDICT_CONFIRM && game.pendingVerdict && (
        <VerdictModal
          verdict={game.pendingVerdict}
          verdictUnlocked={game.verdictUnlocked}
          onConfirm={game.confirmVerdict}
          onCancel={game.cancelVerdict}
        />
      )}

      {game.phase === PHASES.RESULTS && (
        <ResultsPage
          verdictResult={game.verdictResult}
          lastNarration={lastNarration}
          onPlayAgain={game.resetGame}
        />
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
