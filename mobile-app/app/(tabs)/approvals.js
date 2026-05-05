import { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Platform } from 'react-native';
import {
  Card,
  Text,
  Button,
  Dialog,
  Portal,
  TextInput,
  Snackbar,
  ActivityIndicator,
  Chip,
  Avatar,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { choresAPI } from '../../src/api/chores';
import { allowanceAPI } from '../../src/api/allowance';
import {
  isBiometricAvailable,
  authenticateWithBiometric,
  getBiometricType,
  getParentApprovalCredentials,
  saveParentApprovalCredentials,
  hasParentApprovalCredentials,
  isWebAuthnAvailable,
} from '../../src/utils/biometric';

export default function ApprovalsScreen() {
  const { isParent, user } = useAuth();
  const parentMode = isParent();

  const [completions, setCompletions] = useState([]);
  const [walletRequests, setWalletRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Fingerprint');
  const [parentCredsSetUp, setParentCredsSetUp] = useState(false);

  // Parent setup dialog (for child devices)
  const [setupDialogVisible, setSetupDialogVisible] = useState(false);
  const [parentLogin, setParentLogin] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState(null);

  // Reject dialog
  const [rejectDialogVisible, setRejectDialogVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const fetchCompletions = async () => {
    try {
      let data;
      if (parentMode) {
        data = await choresAPI.getPendingCompletions();
      } else {
        // Children see their own completions filtered to pending
        data = await choresAPI.getMyCompletions();
      }
      const list = Array.isArray(data) ? data : data.completions || data.data || [];
      if (!parentMode) {
        // Filter to only pending for children
        setCompletions(list.filter(c => c.status === 'pending'));
      } else {
        setCompletions(list);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load approvals');
    }
  };

  const fetchWalletRequests = async () => {
    try {
      const data = await allowanceAPI.getPendingRequests();
      const list = Array.isArray(data) ? data : [];
      if (!parentMode) {
        setWalletRequests(list.filter(r => {
          const childId = r.childId?._id || r.childId;
          return childId === user?._id || childId === user?.id;
        }));
      } else {
        setWalletRequests(list);
      }
    } catch (err) {
      // Non-critical, wallet requests may not exist yet
    }
  };

  const checkBiometric = async () => {
    // On web, check WebAuthn; on native, check device biometric
    let available = false;
    if (Platform.OS === 'web') {
      available = isWebAuthnAvailable();
    } else {
      available = await isBiometricAvailable();
    }
    setBiometricAvailable(available);
    if (available) {
      const type = await getBiometricType();
      setBiometricType(type || 'Biometric');
    }
    const hasCreds = await hasParentApprovalCredentials();
    setParentCredsSetUp(hasCreds);
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchCompletions(), fetchWalletRequests(), checkBiometric()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCompletions(), fetchWalletRequests()]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [parentMode])
  );

  const handleApprove = async (completion) => {
    const id = completion._id || completion.id;

    if (parentMode) {
      // Parent flow: biometric then approve directly
      const bioAvailable = Platform.OS === 'web'
        ? isWebAuthnAvailable()
        : await isBiometricAvailable();

      if (bioAvailable) {
        const bioType = await getBiometricType();
        const authResult = await authenticateWithBiometric(
          `Use ${bioType} to approve chore`
        );
        if (!authResult.success) {
          if (authResult.error !== 'user_cancel') {
            setError('Authentication required to approve chores');
          }
          return;
        }
      }

      setProcessingId(id);
      try {
        await choresAPI.approveCompletion(id);
        setSuccessMsg('Chore approved!');
        await fetchCompletions();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to approve');
      } finally {
        setProcessingId(null);
      }
    } else {
      // Child flow: need parent credentials + biometric
      if (!biometricAvailable) {
        setError('Biometric must be enabled for quick approve');
        return;
      }

      if (!parentCredsSetUp) {
        // Need parent to set up credentials first
        setPendingApprovalId(id);
        setParentLogin('');
        setParentPassword('');
        setSetupDialogVisible(true);
        return;
      }

      // Biometric check
      const bioType = await getBiometricType();
      const authResult = await authenticateWithBiometric(
        `Parent: use ${bioType} to approve chore`
      );
      if (!authResult.success) {
        if (authResult.error !== 'user_cancel') {
          setError('Parent authentication failed');
        }
        return;
      }

      // Use stored parent credentials
      const creds = await getParentApprovalCredentials();
      if (!creds) {
        setError('Parent credentials not found. Please set up again.');
        setParentCredsSetUp(false);
        return;
      }

      setProcessingId(id);
      try {
        await choresAPI.quickApprove(id, creds.login, creds.password);
        setSuccessMsg('Chore approved!');
        await fetchCompletions();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to approve');
      } finally {
        setProcessingId(null);
      }
    }
  };

  const handleSetupParentCreds = async () => {
    if (!parentLogin.trim() || !parentPassword.trim()) {
      setError('Please enter parent login and password');
      return;
    }

    setSetupSaving(true);

    // Save the credentials
    await saveParentApprovalCredentials(parentLogin.trim().toLowerCase(), parentPassword);
    setParentCredsSetUp(true);
    setSetupDialogVisible(false);

    // Now proceed with the pending approval
    if (pendingApprovalId) {
      const bioType = await getBiometricType();
      const authResult = await authenticateWithBiometric(
        `Parent: use ${bioType} to approve chore`
      );

      if (authResult.success) {
        setProcessingId(pendingApprovalId);
        try {
          await choresAPI.quickApprove(pendingApprovalId, parentLogin.trim().toLowerCase(), parentPassword);
          setSuccessMsg('Chore approved!');
          await fetchCompletions();
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to approve');
        } finally {
          setProcessingId(null);
        }
      }
      setPendingApprovalId(null);
    }

    setSetupSaving(false);
  };

  const openRejectDialog = (completion) => {
    setRejectTarget(completion);
    setRejectNotes('');
    setRejectDialogVisible(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;

    // Require biometric if on child's device
    if (!parentMode) {
      const bioAvailable = Platform.OS === 'web'
        ? isWebAuthnAvailable()
        : await isBiometricAvailable();

      if (bioAvailable) {
        const bioType = await getBiometricType();
        const authResult = await authenticateWithBiometric(
          `Parent: use ${bioType} to reject chore`
        );
        if (!authResult.success) {
          if (authResult.error !== 'user_cancel') {
            setError('Parent authentication required');
          }
          return;
        }
      } else {
        setError('Biometric authentication must be set up for parent quick-actions');
        return;
      }
    }

    const id = rejectTarget._id || rejectTarget.id;
    setProcessingId(id);
    try {
      await choresAPI.rejectCompletion(id, rejectNotes);
      setSuccessMsg('Chore rejected');
      setRejectDialogVisible(false);
      setRejectTarget(null);
      await fetchCompletions();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveWalletRequest = async (request) => {
    const id = request._id || request.id;

    if (parentMode) {
      // Parent flow — direct approve
      setProcessingId(id);
      try {
        await allowanceAPI.approveRequest(id);
        setSuccessMsg('Request approved!');
        await fetchWalletRequests();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to approve request');
      } finally {
        setProcessingId(null);
      }
    } else {
      // Child flow — need biometric + parent creds
      if (!biometricAvailable) {
        setError('Biometric must be enabled for quick approve');
        return;
      }

      if (!parentCredsSetUp) {
        setPendingApprovalId(id);
        setParentLogin('');
        setParentPassword('');
        setSetupDialogVisible(true);
        return;
      }

      const bioType = await getBiometricType();
      const authResult = await authenticateWithBiometric(
        `Parent: use ${bioType} to approve request`
      );
      if (!authResult.success) {
        if (authResult.error !== 'user_cancel') {
          setError('Parent authentication failed');
        }
        return;
      }

      const creds = await getParentApprovalCredentials();
      if (!creds) {
        setError('Parent credentials not found. Please set up again.');
        setParentCredsSetUp(false);
        return;
      }

      setProcessingId(id);
      try {
        await allowanceAPI.quickApproveRequest(id, creds.login, creds.password);
        setSuccessMsg('Request approved!');
        await fetchWalletRequests();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to approve request');
      } finally {
        setProcessingId(null);
      }
    }
  };

  const handleRejectWalletRequest = async (request) => {
    const id = request._id || request.id;
    setProcessingId(id);
    try {
      await allowanceAPI.rejectRequest(id);
      setSuccessMsg('Request rejected');
      await fetchWalletRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  const getWalletTypeLabel = (type) => {
    switch (type) {
      case 'savings_withdrawal': return 'Savings Withdrawal';
      case 'spend_request': return 'Spend Request';
      default: return type;
    }
  };

  const getWalletChildName = (request) =>
    request.childId?.name || 'A child';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading approvals...</Text>
      </View>
    );
  }

  const getChildName = (item) =>
    item.childId?.name ||
    item.childName ||
    item.child?.name ||
    item.user?.name ||
    'A child';

  const getChoreName = (item) =>
    item.choreId?.name || item.choreName || item.chore?.name || 'Chore';

  const renderCompletionCard = ({ item }) => {
    const id = item._id || item.id;
    const isProcessing = processingId === id;
    const showQuickApprove = !parentMode && biometricAvailable;

    return (
      <Card style={styles.card} mode="elevated">
        <Card.Title
          title={getChoreName(item)}
          titleVariant="titleMedium"
          subtitle={parentMode ? `Completed by ${getChildName(item)}` : 'Waiting for approval'}
          left={(props) => (
            <Avatar.Icon
              {...props}
              icon="clock-outline"
              size={40}
              style={styles.pendingAvatar}
            />
          )}
          right={() =>
            !parentMode && showQuickApprove ? (
              <View style={styles.quickApproveButton}>
                <IconButton
                  icon="fingerprint"
                  iconColor="#6200ee"
                  size={28}
                  onPress={() => handleApprove(item)}
                  disabled={isProcessing}
                  loading={isProcessing}
                />
                <Text style={styles.quickApproveLabel}>Approve</Text>
              </View>
            ) : null
          }
        />
        <Card.Content>
          {item.notes ? (
            <Text variant="bodyMedium" style={styles.notes}>
              Notes: {item.notes}
            </Text>
          ) : null}
          {item.completedAt && (
            <Text variant="bodySmall" style={styles.timestamp}>
              {new Date(item.completedAt).toLocaleString()}
            </Text>
          )}
          <View style={styles.chipRow}>
            {(item.choreId?.screenTimeMinutes || item.chore?.screenTimeMinutes) > 0 && (
              <Chip icon="clock-outline" compact style={styles.chip}>
                {item.choreId?.screenTimeMinutes || item.chore?.screenTimeMinutes} min screen time
              </Chip>
            )}
            {(item.choreId?.estimatedMinutes || item.chore?.estimatedMinutes) > 0 && (
              <Chip icon="timer-outline" compact style={styles.chip}>
                ~{item.choreId?.estimatedMinutes || item.chore?.estimatedMinutes} min task
              </Chip>
            )}
          </View>
        </Card.Content>
        {parentMode ? (
          <Card.Actions>
            <Button
              mode="outlined"
              textColor="#d32f2f"
              onPress={() => openRejectDialog(item)}
              disabled={isProcessing}
              compact
              icon="close"
            >
              Reject
            </Button>
            <Button
              mode="contained"
              onPress={() => handleApprove(item)}
              loading={isProcessing}
              disabled={isProcessing}
              compact
              icon="check"
            >
              Approve
            </Button>
          </Card.Actions>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {!parentMode && completions.length > 0 && !parentCredsSetUp && biometricAvailable && (
        <Card style={styles.infoCard} mode="elevated">
          <Card.Content>
            <Text variant="bodySmall" style={styles.infoText}>
              Tap the approve icon on a chore to set up quick parent approval with {biometricType}.
            </Text>
          </Card.Content>
        </Card>
      )}
      {!parentMode && !biometricAvailable && completions.length > 0 && (
        <Card style={styles.infoCard} mode="elevated">
          <Card.Content>
            <Text variant="bodySmall" style={styles.infoText}>
              Ask a parent to approve your chores from their account.
            </Text>
          </Card.Content>
        </Card>
      )}

      <FlatList
        data={completions}
        keyExtractor={(item) => String(item._id || item.id)}
        renderItem={renderCompletionCard}
        contentContainerStyle={
          completions.length === 0 && walletRequests.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#6200ee']}
            tintColor="#6200ee"
          />
        }
        ListEmptyComponent={
          walletRequests.length === 0 ? (
            <View style={styles.emptyView}>
              <Text variant="titleMedium" style={styles.emptyText}>
                No pending approvals
              </Text>
              <Text variant="bodyMedium" style={styles.emptySubtext}>
                {parentMode
                  ? 'All chore completions have been reviewed'
                  : 'Complete a chore and it will show up here for approval'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          walletRequests.length > 0 ? (
            <View style={styles.walletSection}>
              <Text variant="titleMedium" style={styles.walletSectionTitle}>
                Wallet Requests
              </Text>
              {walletRequests.map((request) => {
                const id = request._id || request.id;
                const isProcessing = processingId === id;
                return (
                  <Card key={id} style={styles.walletCard} mode="elevated">
                    <Card.Title
                      title={getWalletTypeLabel(request.type)}
                      titleVariant="titleMedium"
                      subtitle={
                        parentMode
                          ? `${getWalletChildName(request)} - $${request.amount?.toFixed(2)}`
                          : `$${request.amount?.toFixed(2)}`
                      }
                      left={(props) => (
                        <Avatar.Icon
                          {...props}
                          icon={request.type === 'savings_withdrawal' ? 'bank-transfer-out' : 'cart'}
                          size={40}
                          style={styles.walletRequestAvatar}
                        />
                      )}
                    />
                    {request.notes ? (
                      <Card.Content>
                        <Text variant="bodyMedium" style={styles.notes}>
                          {request.notes}
                        </Text>
                        <Text variant="bodySmall" style={styles.timestamp}>
                          {new Date(request.createdAt).toLocaleString()}
                        </Text>
                      </Card.Content>
                    ) : (
                      <Card.Content>
                        <Text variant="bodySmall" style={styles.timestamp}>
                          {new Date(request.createdAt).toLocaleString()}
                        </Text>
                      </Card.Content>
                    )}
                    {parentMode ? (
                      <Card.Actions>
                        <Button
                          mode="outlined"
                          textColor="#d32f2f"
                          onPress={() => handleRejectWalletRequest(request)}
                          disabled={isProcessing}
                          compact
                          icon="close"
                        >
                          Reject
                        </Button>
                        <Button
                          mode="contained"
                          onPress={() => handleApproveWalletRequest(request)}
                          loading={isProcessing}
                          disabled={isProcessing}
                          compact
                          icon="check"
                        >
                          Approve
                        </Button>
                      </Card.Actions>
                    ) : (
                      <Card.Content>
                        <Chip compact style={styles.pendingChip} textStyle={{ color: '#ff9800', fontSize: 12 }}>
                          Pending approval
                        </Chip>
                      </Card.Content>
                    )}
                  </Card>
                );
              })}
            </View>
          ) : null
        }
      />

      <Portal>
        {/* Parent Setup Dialog */}
        <Dialog
          visible={setupDialogVisible}
          onDismiss={() => { setSetupDialogVisible(false); setPendingApprovalId(null); }}
        >
          <Dialog.Title>Set Up Parent Approval</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12 }}>
              A parent needs to enter their login credentials once. After that, approvals can be done with {biometricType}.
            </Text>
            <TextInput
              label="Parent Email or Username"
              value={parentLogin}
              onChangeText={setParentLogin}
              mode="outlined"
              autoCapitalize="none"
              style={styles.dialogInput}
              disabled={setupSaving}
            />
            <TextInput
              label="Parent Password"
              value={parentPassword}
              onChangeText={setParentPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
              disabled={setupSaving}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setSetupDialogVisible(false); setPendingApprovalId(null); }} disabled={setupSaving}>
              Cancel
            </Button>
            <Button onPress={handleSetupParentCreds} loading={setupSaving} disabled={setupSaving}>
              Save & Approve
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog
          visible={rejectDialogVisible}
          onDismiss={() => setRejectDialogVisible(false)}
        >
          <Dialog.Title>Reject Completion</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12 }}>
              Reject {parentMode ? `${getChildName(rejectTarget || {})}'s` : 'your'} completion of "
              {getChoreName(rejectTarget || {})}"?
            </Text>
            <TextInput
              label="Reason (optional)"
              value={rejectNotes}
              onChangeText={setRejectNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRejectDialogVisible(false)}>
              Cancel
            </Button>
            <Button onPress={handleReject} textColor="#d32f2f">
              Reject
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!successMsg}
        onDismiss={() => setSuccessMsg('')}
        duration={2500}
      >
        {successMsg}
      </Snackbar>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyView: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#999',
    textAlign: 'center',
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  infoCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff3e0',
  },
  infoText: {
    color: '#e65100',
  },
  pendingAvatar: {
    backgroundColor: '#ff9800',
  },
  notes: {
    marginBottom: 8,
    fontStyle: 'italic',
    color: '#555',
  },
  timestamp: {
    color: '#999',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    backgroundColor: '#ede7f6',
  },
  quickApproveButton: {
    alignItems: 'center',
    marginRight: 8,
  },
  quickApproveLabel: {
    fontSize: 11,
    color: '#6200ee',
    fontWeight: '600',
    marginTop: -6,
  },
  dialogInput: {
    marginBottom: 12,
  },
  walletSection: {
    marginTop: 16,
  },
  walletSectionTitle: {
    color: '#6200ee',
    fontWeight: '600',
    marginBottom: 12,
  },
  walletCard: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  walletRequestAvatar: {
    backgroundColor: '#fff3e0',
  },
  pendingChip: {
    backgroundColor: '#fff3e0',
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
  },
});
