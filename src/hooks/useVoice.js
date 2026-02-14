import { useState, useCallback, useRef, useEffect } from 'react';

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    return localStorage.getItem('trial_voice_enabled') === 'true';
  });
  const [autoNarrate, setAutoNarrate] = useState(() => {
    return localStorage.getItem('trial_auto_narrate') !== 'false';
  });
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis || null);
  const voiceRef = useRef(null);

  // Pick a good voice on init
  useEffect(() => {
    if (!synthRef.current) return;

    const pickVoice = () => {
      const voices = synthRef.current.getVoices();
      // Prefer a deep English male voice for noir feel
      const preferred = voices.find(v =>
        v.lang.startsWith('en') && /male|daniel|james|google uk/i.test(v.name)
      ) || voices.find(v =>
        v.lang.startsWith('en') && v.localService
      ) || voices[0];
      voiceRef.current = preferred;
    };

    pickVoice();
    synthRef.current.addEventListener('voiceschanged', pickVoice);
    return () => synthRef.current.removeEventListener('voiceschanged', pickVoice);
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(prev => {
      const next = !prev;
      localStorage.setItem('trial_voice_enabled', String(next));
      return next;
    });
  }, []);

  const toggleAutoNarrate = useCallback(() => {
    setAutoNarrate(prev => {
      const next = !prev;
      localStorage.setItem('trial_auto_narrate', String(next));
      return next;
    });
  }, []);

  // Speech Recognition (input)
  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return null;
    }

    // Stop any ongoing speech first
    if (synthRef.current) synthRef.current.cancel();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    let finalTranscript = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript || interim);
    };

    recognitionRef.current = recognition;
    recognition.start();

    return new Promise((resolve) => {
      recognition.onend = () => {
        setIsListening(false);
        resolve(finalTranscript);
      };
      recognition.onerror = (e) => {
        setIsListening(false);
        resolve(finalTranscript || '');
      };
    });
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // Speech Synthesis (output)
  const speak = useCallback((text) => {
    if (!synthRef.current) return;
    if (!voiceEnabled && !autoNarrate) return;

    synthRef.current.cancel();

    // Clean text for speech (remove markdown, brackets, etc)
    const cleanText = text
      .replace(/\*\*?\[?Turn\s*\d+\]?\*?\*?/gi, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/---+/g, '')
      .replace(/\d+[.)]\s+/g, '') // remove option numbers for narration
      .trim();

    if (!cleanText) return;

    // Split into chunks for long text (synth has limits)
    const chunks = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

    let chunkIndex = 0;
    const speakNext = () => {
      if (chunkIndex >= chunks.length) {
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.voice = voiceRef.current;
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      utterance.volume = 1;

      utterance.onend = () => {
        chunkIndex++;
        speakNext();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      synthRef.current.speak(utterance);
    };

    setIsSpeaking(true);
    speakNext();
  }, [voiceEnabled, autoNarrate]);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) synthRef.current.cancel();
    setIsSpeaking(false);
  }, []);

  const speechRecognitionSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const speechSynthesisSupported = !!window.speechSynthesis;

  return {
    isListening, isSpeaking, transcript,
    voiceEnabled, autoNarrate,
    toggleVoice, toggleAutoNarrate,
    startListening, stopListening,
    speak, stopSpeaking,
    speechRecognitionSupported, speechSynthesisSupported,
  };
}
