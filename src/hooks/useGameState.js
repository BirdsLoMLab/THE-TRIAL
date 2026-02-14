import { useState, useCallback, useRef } from 'react';
import { sendMessage, parseResponse } from '../services/claudeApi';

export const PHASES = {
  LANDING: 'landing',
  PLAYING: 'playing',
  VERDICT_CONFIRM: 'verdict_confirm',
  RESULTS: 'results',
};

export function useGameState() {
  const [phase, setPhase] = useState(PHASES.LANDING);
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [turn, setTurn] = useState(0);
  const [evidenceExamined, setEvidenceExamined] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scene, setScene] = useState(null);
  const [verdictResult, setVerdictResult] = useState(null);
  const [pendingVerdict, setPendingVerdict] = useState(null);
  const apiKeyRef = useRef('');

  const verdictUnlocked = turn >= 4;

  const setApiKey = useCallback((key) => {
    apiKeyRef.current = key;
    localStorage.setItem('trial_api_key', key);
  }, []);

  const getApiKey = useCallback(() => {
    if (apiKeyRef.current) return apiKeyRef.current;
    const stored = localStorage.getItem('trial_api_key');
    if (stored) {
      apiKeyRef.current = stored;
      return stored;
    }
    return '';
  }, []);

  const startGame = useCallback(async () => {
    const key = getApiKey();
    if (!key) {
      setError('Please enter your Claude API key first.');
      return;
    }

    setPhase(PHASES.PLAYING);
    setMessages([]);
    setConversationHistory([]);
    setTurn(0);
    setEvidenceExamined([]);
    setError(null);
    setScene(null);
    setVerdictResult(null);
    setLoading(true);

    try {
      const initialMessage = 'Begin a new case. Set the scene.';
      const response = await sendMessage(key, [], initialMessage);
      const parsed = parseResponse(response);

      const newHistory = [
        { role: 'user', content: initialMessage },
        { role: 'assistant', content: response },
      ];

      setConversationHistory(newHistory);
      setMessages([{ role: 'assistant', text: parsed.narration, options: parsed.options }]);
      if (parsed.turn) setTurn(parsed.turn);
      if (parsed.scene) setScene(parsed.scene);
    } catch (err) {
      setError(err.message);
      setPhase(PHASES.LANDING);
    } finally {
      setLoading(false);
    }
  }, [getApiKey]);

  const sendAction = useCallback(async (actionText) => {
    const key = getApiKey();
    if (!key || loading) return;

    setLoading(true);
    setError(null);

    setMessages(prev => [...prev, { role: 'user', text: actionText }]);

    try {
      const response = await sendMessage(key, conversationHistory, actionText);
      const parsed = parseResponse(response);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: actionText },
        { role: 'assistant', content: response },
      ]);

      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: parsed.narration, options: parsed.options },
      ]);

      if (parsed.turn) setTurn(parsed.turn);
      if (parsed.scene) setScene(parsed.scene);

      if (parsed.verdictResult) {
        setVerdictResult(parsed.verdictResult);
        setPhase(PHASES.RESULTS);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getApiKey, loading, conversationHistory]);

  const requestVerdict = useCallback((verdict) => {
    setPendingVerdict(verdict);
    setPhase(PHASES.VERDICT_CONFIRM);
  }, []);

  const confirmVerdict = useCallback(async () => {
    if (!pendingVerdict) return;
    setPhase(PHASES.PLAYING);
    await sendAction(`I deliver my verdict: ${pendingVerdict.toUpperCase()}.`);
    setPendingVerdict(null);
  }, [pendingVerdict, sendAction]);

  const cancelVerdict = useCallback(() => {
    setPendingVerdict(null);
    setPhase(PHASES.PLAYING);
  }, []);

  const resetGame = useCallback(() => {
    setPhase(PHASES.LANDING);
    setMessages([]);
    setConversationHistory([]);
    setTurn(0);
    setEvidenceExamined([]);
    setError(null);
    setScene(null);
    setVerdictResult(null);
    setPendingVerdict(null);
    setLoading(false);
  }, []);

  return {
    phase, messages, turn, evidenceExamined, loading, error, scene,
    verdictResult, verdictUnlocked, pendingVerdict,
    setApiKey, getApiKey, startGame, sendAction,
    requestVerdict, confirmVerdict, cancelVerdict, resetGame, setError,
  };
}
