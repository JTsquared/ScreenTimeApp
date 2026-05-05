// API Configuration
// TODO: Update this with your actual backend URL
// For web PWA, use relative URL (nginx proxies to backend)
// For native app (Expo Go), use the full URL
import { Platform } from 'react-native';

export const API_BASE_URL = Platform.OS === 'web'
  ? '/api'
  : 'http://141.148.79.169:3000/api';

// For local development/testing, you can use:
// - iOS Simulator: http://localhost:3000/api
// - Android Emulator: http://10.0.2.2:3000/api
// - Physical device: http://your-computer-ip:3000/api
// - Production: http://your-cloud-server-ip:3000/api

export const API_TIMEOUT = 10000; // 10 seconds
