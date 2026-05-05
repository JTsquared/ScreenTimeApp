import { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, Snackbar, Dialog, Portal } from 'react-native-paper';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import {
  isBiometricAvailable,
  getBiometricType,
  authenticateWithBiometric,
  getBiometricCredentials,
  saveBiometricCredentials,
  isWebAuthnAvailable,
  hasWebAuthnCredential,
  setWebAuthnRegistered,
  setWebAuthnEmail,
  webauthnRegister,
  webauthnAuthenticate,
} from '../../src/utils/biometric';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [showEnableBiometricDialog, setShowEnableBiometricDialog] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);

  // Web WebAuthn state
  const [webAuthnAvailable, setWebAuthnAvailable] = useState(false);
  const [webAuthnRegistered, setWebAuthnRegisteredState] = useState(false);
  const [savedWebAuthnEmail, setSavedWebAuthnEmail] = useState('');

  const { login, isParent, updateUser } = useAuth();
  const router = useRouter();

  const getHomeRoute = (userData) => {
    const role = userData?.role || (isParent() ? 'parent' : 'child');
    return role === 'parent' ? '/(tabs)/chores' : '/(tabs)/profile';
  };

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    if (Platform.OS === 'web') {
      // Web: check WebAuthn
      const available = isWebAuthnAvailable();
      setWebAuthnAvailable(available);
      if (available) {
        // Check if any user has registered on this device
        // We store the email separately so we can pre-fill and show the button
        const storedEmail = localStorage.getItem('webauthn_email');
        if (storedEmail) {
          setSavedWebAuthnEmail(storedEmail);
          // We don't know the userId yet, but we can check by email convention
          // The hasWebAuthnCredential check needs a userId, so we check for the email flag
          setWebAuthnRegisteredState(true);
        }
      }
      // Also check native biometric (will be false on web, handled by isBiometricAvailable)
      setBiometricAvailable(false);
    } else {
      // Native: check device biometric
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricType(type || 'Biometric');
        const creds = await getBiometricCredentials();
        setHasSavedCredentials(!!creds);
      }
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    const result = await login(email.toLowerCase().trim(), password);

    setLoading(false);

    if (result.success) {
      if (Platform.OS === 'web') {
        // Web: offer to register WebAuthn if available and not yet registered
        const userId = result.user._id || result.user.id;
        if (webAuthnAvailable && !hasWebAuthnCredential(userId)) {
          setPendingCredentials({ email: email.toLowerCase().trim(), password, userData: result.user });
          setShowEnableBiometricDialog(true);
          return;
        }
      } else {
        // Native: offer to enable biometric
        if (biometricAvailable && !hasSavedCredentials) {
          setPendingCredentials({ email: email.toLowerCase().trim(), password, userData: result.user });
          setShowEnableBiometricDialog(true);
          return;
        }
      }
      router.replace(getHomeRoute(result.user));
    } else {
      setError(result.error);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError('');

    const authResult = await authenticateWithBiometric(`Sign in with ${biometricType}`);

    if (!authResult.success) {
      setLoading(false);
      if (authResult.error !== 'user_cancel') {
        setError('Biometric authentication failed');
      }
      return;
    }

    const creds = await getBiometricCredentials();
    if (!creds) {
      setLoading(false);
      setError('No saved credentials. Please sign in with your password.');
      setHasSavedCredentials(false);
      return;
    }

    const result = await login(creds.email, creds.password);

    setLoading(false);

    if (result.success) {
      router.replace(getHomeRoute(result.user));
    } else {
      setError('Saved credentials are invalid. Please sign in with your password.');
      setHasSavedCredentials(false);
    }
  };

  const handleWebAuthnLogin = async () => {
    setLoading(true);
    setError('');

    const emailToUse = savedWebAuthnEmail || email.toLowerCase().trim();
    if (!emailToUse) {
      setError('Please enter your email or username first');
      setLoading(false);
      return;
    }

    const result = await webauthnAuthenticate(emailToUse);

    if (!result.success) {
      setLoading(false);
      if (result.error !== 'user_cancel') {
        setError(result.error || 'Biometric authentication failed');
      }
      return;
    }

    // Store auth data (same as normal login flow)
    await AsyncStorage.setItem('authToken', result.user.token);
    await AsyncStorage.setItem('user', JSON.stringify(result.user));
    await updateUser(result.user);

    setLoading(false);
    router.replace(getHomeRoute(result.user));
  };

  const handleEnableBiometric = async () => {
    if (!pendingCredentials) return;

    if (Platform.OS === 'web') {
      // Web: register WebAuthn credential
      setLoading(true);
      const token = pendingCredentials.userData.token;
      const regResult = await webauthnRegister(token);
      setLoading(false);

      console.log('WebAuthn register result:', JSON.stringify(regResult));
      if (regResult.success) {
        const userId = pendingCredentials.userData._id || pendingCredentials.userData.id;
        setWebAuthnRegistered(userId);
        setWebAuthnEmail(pendingCredentials.email);
        setSavedWebAuthnEmail(pendingCredentials.email);
        setWebAuthnRegisteredState(true);
      } else {
        if (regResult.error !== 'user_cancel') {
          setError(regResult.error || 'Failed to register biometric');
        }
        // Don't proceed to home on failure
        setShowEnableBiometricDialog(false);
        setPendingCredentials(null);
        setLoading(false);
        return;
      }
    } else {
      // Native: save credentials to SecureStore
      await saveBiometricCredentials(pendingCredentials.email, pendingCredentials.password);
      setHasSavedCredentials(true);
    }

    const userData = pendingCredentials?.userData;
    setShowEnableBiometricDialog(false);
    setPendingCredentials(null);
    router.replace(getHomeRoute(userData));
  };

  const handleSkipBiometric = () => {
    const userData = pendingCredentials?.userData;
    setShowEnableBiometricDialog(false);
    setPendingCredentials(null);
    router.replace(getHomeRoute(userData));
  };

  // Determine which biometric login button to show
  const showNativeBiometric = Platform.OS !== 'web' && biometricAvailable && hasSavedCredentials;
  const showWebAuthnLogin = Platform.OS === 'web' && webAuthnAvailable && webAuthnRegistered;
  const showBiometricButton = showNativeBiometric || showWebAuthnLogin;

  const biometricLabel = Platform.OS === 'web' ? 'Biometric' : biometricType;
  const dialogBiometricLabel = Platform.OS === 'web' ? 'Biometric (WebAuthn)' : biometricType;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text variant="headlineLarge" style={styles.title}>
            ScreenTime Manager
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Sign in to continue
          </Text>

          {/* Biometric login button (native or WebAuthn) */}
          {showBiometricButton && (
            <Button
              mode="contained"
              onPress={showNativeBiometric ? handleBiometricLogin : handleWebAuthnLogin}
              loading={loading}
              disabled={loading}
              style={styles.biometricButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              icon="fingerprint"
            >
              Sign in with {biometricLabel}
            </Button>
          )}

          {showBiometricButton && (
            <Text style={styles.orDivider}>or sign in with credentials</Text>
          )}

          <TextInput
            label="Email or Username"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            autoCapitalize="none"
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
            style={styles.input}
            disabled={loading}
          />

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Sign In
          </Button>

          <Button
            mode="text"
            onPress={() => router.push('/(auth)/register')}
            disabled={loading}
            style={styles.linkButton}
          >
            Don't have an account? Register
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={showEnableBiometricDialog}
          onDismiss={handleSkipBiometric}
        >
          <Dialog.Title>Enable {dialogBiometricLabel}?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Would you like to use {dialogBiometricLabel} to sign in next time? You won't need to enter your password.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleSkipBiometric}>Not Now</Button>
            <Button onPress={handleEnableBiometric} loading={loading}>Enable</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={3000}
        action={{
          label: 'Dismiss',
          onPress: () => setError(''),
        }}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    color: '#6200ee',
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  biometricButton: {
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#6200ee',
  },
  orDivider: {
    textAlign: 'center',
    color: '#999',
    marginBottom: 16,
    fontSize: 14,
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkButton: {
    marginTop: 16,
  },
});
