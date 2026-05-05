import { Platform } from 'react-native';

// Web PWA uses relative URL (nginx proxies to backend)
// Native app (Expo Go) uses the full HTTPS URL
export const API_BASE_URL = Platform.OS === 'web'
  ? '/api'
  : 'https://screentime.bubbledegen.xyz/api';

export const API_TIMEOUT = 10000;
