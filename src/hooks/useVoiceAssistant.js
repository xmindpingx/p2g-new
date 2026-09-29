// places2go — useVoiceAssistant
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Hands-free search: listen (expo-speech-recognition) → parse (utils/voiceQuery)
// → run against the store → speak the answer (expo-speech) → listen for a
// follow-up ("directions", "walk", "drive", "repeat", "cancel").
//
// Recognition runs through the OS speech service (Apple / Google). Nothing is
// sent to a places2go server. The mic is only open while `listening` is true.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

import useStore from '../store/useStore';
import { parseVoiceQuery, runVoiceQuery, describeResult, describeNoResult, VOICE_INTENT } from '../utils/voiceQuery';

export const ASSISTANT_PHASE = {
  IDLE:      'idle',
  LISTENING: 'listening',
  THINKING:  'thinking',
  SPEAKING:  'speaking',
  RESULT:    'result',     // result shown; waiting for a follow-up command or tap
  ERROR:     'error',
};

export default function useVoiceAssistant({ userLocation = null, onDirections } = {}) {
  const appSettings       = useStore((s) => s.appSettings);
  const places            = useStore((s) => s.places);
  const reviews           = useStore((s) => s.reviews);
  const officialAmenities = useStore((s) => s.officialAmenities);
  const currentUser       = useStore((s) => s.currentUser);

  const [phase, setPhase]           = useState(ASSISTANT_PHASE.IDLE);
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed]         = useState(null);
  const [result, setResult]         = useState(null);   // { place, total }
  const [spoken, setSpoken]         = useState('');
  const [error, setError]           = useState(null);
  const [available, setAvailable]   = useState(null);

  const timeoutRef   = useRef(null);
  const lastSpokenRef = useRef('');
  const resultRef    = useRef(null);

  useEffect(() => {
    try { setAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable()); }
    catch (err) { setAvailable(false); }
    return () => { clearTimeout(timeoutRef.current); Speech.stop(); try { ExpoSpeechRecognitionModule.abort(); } catch (e) { /* not started */ } };
  }, []);

  const speak = useCallback((text, { then } = {}) => {
    lastSpokenRef.current = text;
    setSpoken(text);
    if (!appSettings.handsFreeSpeakResults) { then?.(); return; }
    setPhase(ASSISTANT_PHASE.SPEAKING);
    Speech.stop();
    Speech.speak(text, {
      language: appSettings.handsFreeLanguage || 'en-US',
      onDone:   () => then?.(),
      onStopped:() => then?.(),
      onError:  () => then?.(),
    });
  }, [appSettings.handsFreeSpeakResults, appSettings.handsFreeLanguage]);

  const stopListening = useCallback(() => {
    clearTimeout(timeoutRef.current);
    try { ExpoSpeechRecognitionModule.stop(); } catch (err) { /* not started */ }
  }, []);

  const listen = useCallback(async () => {
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone or speech recognition permission was not granted. You can allow it in your device settings.');
        setPhase(ASSISTANT_PHASE.ERROR);
        return;
      }
      setTranscript('');
      setPhase(ASSISTANT_PHASE.LISTENING);
      ExpoSpeechRecognitionModule.start({
        lang:            appSettings.handsFreeLanguage || 'en-US',
        interimResults:  true,
        continuous:      false,
        addsPunctuation: false,
        maxAlternatives: 1,
      });
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => stopListening(), Math.max(3, appSettings.handsFreeListenSeconds) * 1000);
    } catch (err) {
      setError(err.message || 'Could not start listening');
      setPhase(ASSISTANT_PHASE.ERROR);
    }
  }, [appSettings.handsFreeLanguage, appSettings.handsFreeListenSeconds, stopListening]);

  const handleFinal = useCallback((text) => {
    clearTimeout(timeoutRef.current);
    setPhase(ASSISTANT_PHASE.THINKING);
    const p = parseVoiceQuery(text, { officialAmenities });
    setParsed(p);

    if (p.intent === VOICE_INTENT.CANCEL) {
      setResult(null); resultRef.current = null;
      setPhase(ASSISTANT_PHASE.IDLE);
      return;
    }
    if (p.intent === VOICE_INTENT.REPEAT) {
      if (lastSpokenRef.current) speak(lastSpokenRef.current, { then: () => setPhase(resultRef.current ? ASSISTANT_PHASE.RESULT : ASSISTANT_PHASE.IDLE) });
      else setPhase(ASSISTANT_PHASE.IDLE);
      return;
    }
    if (p.intent === VOICE_INTENT.DIRECTIONS) {
      const current = resultRef.current?.place;
      if (current) {
        speak(`Starting ${p.mode === 'driving' ? 'driving' : 'walking'} directions to ${current.name}.`, {
          then: () => { setPhase(ASSISTANT_PHASE.IDLE); onDirections?.(current, p.mode || 'walking'); },
        });
      } else {
        speak('Ask for a place first, then say directions.', { then: () => setPhase(ASSISTANT_PHASE.IDLE) });
      }
      return;
    }
    if (p.intent !== VOICE_INTENT.FIND) {
      speak("Sorry, I didn't catch that. Try: closest clean restroom with a changing table.", { then: () => setPhase(ASSISTANT_PHASE.IDLE) });
      return;
    }

    const { results, total } = runVoiceQuery(p, { places, reviews, userLocation, currentUserId: currentUser.id });
    const top = results[0] || null;
    const next = { place: top, total, alternatives: results.slice(1, 3) };
    setResult(next); resultRef.current = next;

    const text2 = top
      ? describeResult(top, { userLocation, officialAmenities, matchedKeys: p.filters.amenityKeys })
      : describeNoResult(p);
    speak(text2, {
      then: () => {
        if (top && p.wantsDirections) { onDirections?.(top, p.mode || 'walking'); setPhase(ASSISTANT_PHASE.IDLE); return; }
        setPhase(top ? ASSISTANT_PHASE.RESULT : ASSISTANT_PHASE.IDLE);
      },
    });
  }, [officialAmenities, places, reviews, userLocation, currentUser.id, speak, onDirections]);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript || '';
    setTranscript(text);
    if (event.isFinal && text.trim()) handleFinal(text);
  });
  useSpeechRecognitionEvent('end', () => {
    clearTimeout(timeoutRef.current);
    setPhase((prev) => (prev === ASSISTANT_PHASE.LISTENING ? ASSISTANT_PHASE.IDLE : prev));
  });
  useSpeechRecognitionEvent('error', (event) => {
    clearTimeout(timeoutRef.current);
    if (event.error === 'aborted') { setPhase(ASSISTANT_PHASE.IDLE); return; }
    if (event.error === 'no-speech') { setError("I didn't hear anything. Tap the mic and try again."); setPhase(ASSISTANT_PHASE.IDLE); return; }
    setError(event.message || `Speech recognition error (${event.error})`);
    setPhase(ASSISTANT_PHASE.ERROR);
  });

  const reset = useCallback(() => {
    stopListening();
    Speech.stop();
    setPhase(ASSISTANT_PHASE.IDLE);
    setTranscript(''); setParsed(null); setResult(null); resultRef.current = null; setSpoken(''); setError(null);
  }, [stopListening]);

  return {
    available,
    phase,
    transcript,
    parsed,
    result,
    spoken,
    error,
    listen,
    stopListening,
    reset,
    speakAgain: () => lastSpokenRef.current && speak(lastSpokenRef.current, { then: () => setPhase(resultRef.current ? ASSISTANT_PHASE.RESULT : ASSISTANT_PHASE.IDLE) }),
  };
}
