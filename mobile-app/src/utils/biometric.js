import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const PARENT_APPROVAL_CREDENTIALS_KEY = 'parent_approval_credentials';

/**
 * Check if biometric authentication is available on this device
 */
export async function isBiometricAvailable() {
  if (Platform.OS === 'web') return false;

  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

/**
 * Get the type of biometric available (for display purposes)
 */
export async function getBiometricType() {
  if (Platform.OS === 'web') return null;

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
 * Prompt the user for biometric authentication
 */
export async function authenticateWithBiometric(promptMessage = 'Authenticate') {
  if (Platform.OS === 'web') return { success: false, error: 'Not available on web' };

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  return result;
}

/**
 * Save login credentials securely for biometric login
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
 * Get saved biometric credentials
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
 * Check if biometric login is enabled
 */
export async function isBiometricLoginEnabled() {
  if (Platform.OS === 'web') return false;

  const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return enabled === 'true';
}

/**
 * Disable biometric login
 */
export async function disableBiometricLogin() {
  if (Platform.OS === 'web') return;

  await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
}

/**
 * Save parent credentials for quick-approve on child devices
 */
export async function saveParentApprovalCredentials(login, password) {
  if (Platform.OS === 'web') return;

  await SecureStore.setItemAsync(
    PARENT_APPROVAL_CREDENTIALS_KEY,
    JSON.stringify({ login, password })
  );
}

/**
 * Get saved parent approval credentials
 */
export async function getParentApprovalCredentials() {
  if (Platform.OS === 'web') return null;

  const data = await SecureStore.getItemAsync(PARENT_APPROVAL_CREDENTIALS_KEY);
  if (!data) return null;

  return JSON.parse(data);
}

/**
 * Check if parent approval credentials are saved
 */
export async function hasParentApprovalCredentials() {
  if (Platform.OS === 'web') return false;

  const data = await SecureStore.getItemAsync(PARENT_APPROVAL_CREDENTIALS_KEY);
  return !!data;
}

/**
 * Remove parent approval credentials
 */
export async function removeParentApprovalCredentials() {
  if (Platform.OS === 'web') return;

  await SecureStore.deleteItemAsync(PARENT_APPROVAL_CREDENTIALS_KEY);
}
