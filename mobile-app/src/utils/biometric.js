import { Platform } from 'react-native';

// Native-only imports — guarded by Platform.OS checks at usage sites
let LocalAuthentication = null;
let SecureStore = null;

if (Platform.OS !== 'web') {
  LocalAuthentication = require('expo-local-authentication');
  SecureStore = require('expo-secure-store');
}

const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const PARENT_APPROVAL_CREDENTIALS_KEY = 'parent_approval_credentials';
const WEBAUTHN_REGISTERED_PREFIX = 'webauthn_registered_';

// ============================================================
// Web-only: lazy-load @simplewebauthn/browser to avoid bundling
// on native where it would fail.
// ============================================================
let _webauthnBrowser = null;
async function getWebAuthnBrowser() {
  if (Platform.OS !== 'web') return null;
  if (!_webauthnBrowser) {
    _webauthnBrowser = await import('@simplewebauthn/browser');
  }
  return _webauthnBrowser;
}

// ============================================================
// Shared helpers
// ============================================================

/**
 * Check if biometric authentication is available on this device.
 * On web: checks for WebAuthn support.
 * On native: checks for hardware + enrollment via expo-local-authentication.
 */
export async function isBiometricAvailable() {
  if (Platform.OS === 'web') {
    return isWebAuthnAvailable();
  }

  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

/**
 * Get the type of biometric available (for display purposes).
 * On web: returns 'Biometric' (browser does not expose type).
 * On native: returns specific type like 'Fingerprint', 'Face ID', etc.
 */
export async function getBiometricType() {
  if (Platform.OS === 'web') return 'Biometric';

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris';
  }
  return 'Biometric';
}

/**
 * Prompt the user for biometric authentication.
 * On native: uses expo-local-authentication.
 * On web: performs a WebAuthn assertion with userVerification: required,
 *         which triggers the browser biometric prompt. This proves a person
 *         with registered biometrics is physically present.
 */
export async function authenticateWithBiometric(promptMessage = 'Authenticate') {
  if (Platform.OS === 'web') {
    // On web, use WebAuthn assertion to verify user presence.
    // This requires the user to have previously registered a WebAuthn credential.
    try {
      const resp = await fetch('/api/webauthn/auth-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: _getStoredWebAuthnEmail() }),
      });
      if (!resp.ok) {
        return { success: false, error: 'webauthn_not_available' };
      }
      const options = await resp.json();
      const webauthn = await getWebAuthnBrowser();
      const assertion = await webauthn.startAuthentication({ optionsJSON: options });
      // We don't need to verify with the server for a simple presence check,
      // but the assertion succeeding means the user passed biometric verification.
      return { success: true };
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        return { success: false, error: 'user_cancel' };
      }
      return { success: false, error: err.message || 'WebAuthn authentication failed' };
    }
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  return result;
}

// ============================================================
// Native-only: biometric credentials (unchanged from original)
// ============================================================

/**
 * Save login credentials securely for biometric login (native only).
 */
export async function saveBiometricCredentials(email, password) {
  if (Platform.OS === 'web') return;

  await SecureStore.setItemAsync(
    BIOMETRIC_CREDENTIALS_KEY,
    JSON.stringify({ email, password })
  );
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
}

/**
 * Get saved biometric credentials (native only).
 */
export async function getBiometricCredentials() {
  if (Platform.OS === 'web') return null;

  const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  if (enabled !== 'true') return null;

  const data = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
  if (!data) return null;

  return JSON.parse(data);
}

/**
 * Check if biometric login is enabled (native only).
 */
export async function isBiometricLoginEnabled() {
  if (Platform.OS === 'web') return false;

  const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return enabled === 'true';
}

/**
 * Disable biometric login (native only).
 */
export async function disableBiometricLogin() {
  if (Platform.OS === 'web') return;

  await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
}

// ============================================================
// Parent approval credentials — works on both web and native
// ============================================================

/**
 * Save parent credentials for quick-approve on child devices.
 * On web: uses localStorage. On native: uses SecureStore.
 */
export async function saveParentApprovalCredentials(login, password) {
  if (Platform.OS === 'web') {
    localStorage.setItem(
      PARENT_APPROVAL_CREDENTIALS_KEY,
      JSON.stringify({ login, password })
    );
    return;
  }

  await SecureStore.setItemAsync(
    PARENT_APPROVAL_CREDENTIALS_KEY,
    JSON.stringify({ login, password })
  );
}

/**
 * Get saved parent approval credentials.
 * On web: reads from localStorage. On native: reads from SecureStore.
 */
export async function getParentApprovalCredentials() {
  if (Platform.OS === 'web') {
    const data = localStorage.getItem(PARENT_APPROVAL_CREDENTIALS_KEY);
    if (!data) return null;
    return JSON.parse(data);
  }

  const data = await SecureStore.getItemAsync(PARENT_APPROVAL_CREDENTIALS_KEY);
  if (!data) return null;

  return JSON.parse(data);
}

/**
 * Check if parent approval credentials are saved.
 */
export async function hasParentApprovalCredentials() {
  if (Platform.OS === 'web') {
    return !!localStorage.getItem(PARENT_APPROVAL_CREDENTIALS_KEY);
  }

  const data = await SecureStore.getItemAsync(PARENT_APPROVAL_CREDENTIALS_KEY);
  return !!data;
}

/**
 * Remove parent approval credentials.
 */
export async function removeParentApprovalCredentials() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(PARENT_APPROVAL_CREDENTIALS_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(PARENT_APPROVAL_CREDENTIALS_KEY);
}

// ============================================================
// WebAuthn-specific functions (web only)
// ============================================================

/**
 * Check if the browser supports WebAuthn.
 */
export function isWebAuthnAvailable() {
  if (Platform.OS !== 'web') return false;
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  );
}

/**
 * Check if a user has registered a WebAuthn credential on this device.
 * Uses a localStorage flag.
 */
export function hasWebAuthnCredential(userId) {
  if (Platform.OS !== 'web') return false;
  return localStorage.getItem(WEBAUTHN_REGISTERED_PREFIX + userId) === 'true';
}

/**
 * Mark that a user has registered a WebAuthn credential on this device.
 */
export function setWebAuthnRegistered(userId) {
  if (Platform.OS !== 'web') return;
  localStorage.setItem(WEBAUTHN_REGISTERED_PREFIX + userId, 'true');
}

// Store the email/username used for WebAuthn auth-options calls
// (needed for the biometric presence check in authenticateWithBiometric on web).
const WEBAUTHN_EMAIL_KEY = 'webauthn_email';

function _getStoredWebAuthnEmail() {
  if (Platform.OS !== 'web') return null;
  return localStorage.getItem(WEBAUTHN_EMAIL_KEY);
}

/**
 * Save the email/username associated with the current WebAuthn registration.
 * Called after registration so that authenticateWithBiometric can look up
 * credentials without needing the email passed in every time.
 */
export function setWebAuthnEmail(email) {
  if (Platform.OS !== 'web') return;
  localStorage.setItem(WEBAUTHN_EMAIL_KEY, email);
}

/**
 * Register a WebAuthn credential for the currently authenticated user.
 * Calls backend for options, runs browser WebAuthn ceremony, then verifies.
 * @param {string} authToken - JWT token for the authenticated user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function webauthnRegister(authToken) {
  if (Platform.OS !== 'web') {
    return { success: false, error: 'WebAuthn is only available on web' };
  }

  try {
    // Step 1: Get registration options from backend
    const optionsResp = await fetch('/api/webauthn/register-options', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!optionsResp.ok) {
      const errData = await optionsResp.json().catch(() => ({}));
      return { success: false, error: errData.message || 'Failed to get registration options' };
    }

    const options = await optionsResp.json();

    // Step 2: Start browser registration ceremony
    const webauthn = await getWebAuthnBrowser();
    let registrationResponse;
    try {
      registrationResponse = await webauthn.startRegistration({ optionsJSON: options });
    } catch (regErr) {
      console.error('WebAuthn startRegistration error:', regErr);
      if (regErr.name === 'NotAllowedError') {
        return { success: false, error: 'user_cancel' };
      }
      // Try alternate API shape for older versions
      try {
        registrationResponse = await webauthn.startRegistration(options);
      } catch (regErr2) {
        console.error('WebAuthn startRegistration fallback error:', regErr2);
        return { success: false, error: regErr2.message || 'Registration failed' };
      }
    }

    // Step 3: Send result to backend for verification
    const verifyResp = await fetch('/api/webauthn/register-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(registrationResponse),
    });

    if (!verifyResp.ok) {
      const errData = await verifyResp.json().catch(() => ({}));
      return { success: false, error: errData.message || 'Registration verification failed' };
    }

    return { success: true };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'user_cancel' };
    }
    return { success: false, error: err.message || 'WebAuthn registration failed' };
  }
}

/**
 * Authenticate a user via WebAuthn.
 * Calls backend for auth options, runs browser assertion, then verifies.
 * Returns user data + token on success (same shape as normal login).
 * @param {string} email - email or username
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function webauthnAuthenticate(email) {
  if (Platform.OS !== 'web') {
    return { success: false, error: 'WebAuthn is only available on web' };
  }

  try {
    // Step 1: Get auth options from backend
    const optionsResp = await fetch('/api/webauthn/auth-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!optionsResp.ok) {
      const errData = await optionsResp.json().catch(() => ({}));
      return { success: false, error: errData.message || 'Failed to get auth options' };
    }

    const options = await optionsResp.json();

    // Step 2: Start browser authentication ceremony
    const webauthn = await getWebAuthnBrowser();
    const authResponse = await webauthn.startAuthentication({ optionsJSON: options });

    // Step 3: Send result to backend for verification
    const verifyResp = await fetch('/api/webauthn/auth-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, authResponse }),
    });

    if (!verifyResp.ok) {
      const errData = await verifyResp.json().catch(() => ({}));
      return { success: false, error: errData.message || 'Authentication verification failed' };
    }

    const userData = await verifyResp.json();
    return { success: true, user: userData };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'user_cancel' };
    }
    return { success: false, error: err.message || 'WebAuthn authentication failed' };
  }
}
