import { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, Snackbar, Dialog, Portal } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import {
  isBiometricAvailable,
  getBiometricType,
  authenticateWithBiometric,
  getBiometricCredentials,
  saveBiometricCredentials,
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

  const { login, isParent } = useAuth();
  const router = useRouter();

  const getHomeRoute = (userData) => {
    const role = userData?.role || (isParent() ? 'parent' : 'child');
    return role === 'parent' ? '/(tabs)/chores' : '/(tabs)/profile';
  };

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);
    if (available) {
      const type = await getBiometricType();
      setBiometricType(type || 'Biometric');
      const creds = await getBiometricCredentials();
      setHasSavedCredentials(!!creds);
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
      // If biometric is available but not set up, ask to enable
      if (biometricAvailable && !hasSavedCredentials) {
        setPendingCredentials({ email: email.toLowerCase().trim(), password, userData: result.user });
        setShowEnableBiometricDialog(true);
      } else {
        router.replace(getHomeRoute(result.user));
      }
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

  const handleEnableBiometric = async () => {
    if (pendingCredentials) {
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

          {/* Biometric login button */}
          {biometricAvailable && hasSavedCredentials && (
            <Button
              mode="contained"
              onPress={handleBiometricLogin}
              loading={loading}
              disabled={loading}
              style={styles.biometricButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              icon="fingerprint"
            >
              Sign in with {biometricType}
            </Button>
          )}

          {biometricAvailable && hasSavedCredentials && (
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
          <Dialog.Title>Enable {biometricType}?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Would you like to use {biometricType} to sign in next time? You won't need to enter your password.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleSkipBiometric}>Not Now</Button>
            <Button onPress={handleEnableBiometric}>Enable</Button>
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
