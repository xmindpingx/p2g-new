// places2go — Speech recognition platform wrapper (web)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// expo-speech-recognition is native-only. On the web the module reports that
// recognition is unavailable, so useVoiceAssistant hides the voice controls.
export const ExpoSpeechRecognitionModule = {
  isRecognitionAvailable: () => false,
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  getPermissionsAsync:     async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  start: () => {},
  stop:  () => {},
  abort: () => {},
};

// Same signature as the native hook; nothing ever fires on the web.
export function useSpeechRecognitionEvent(_eventName, _listener) {}
