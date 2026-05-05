import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Platform } from 'react-native';
import {
  Card,
  Text,
  Button,
  Dialog,
  Portal,
  TextInput,
  Snackbar,
  ActivityIndicator,
  Avatar,
  Divider,
  Chip,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { allowanceAPI } from '../../src/api/allowance';
import { choresAPI } from '../../src/api/chores';
import { familyAPI } from '../../src/api/family';
import {
  isBiometricAvailable,
  authenticateWithBiometric,
  getBiometricType,
  getParentApprovalCredentials,
  saveParentApprovalCredentials,
  hasParentApprovalCredentials,
  isWebAuthnAvailable,
} from '../../src/utils/biometric';

export default function WalletScreen() {
  const { user, isParent } = useAuth();
  const parentMode = isParent();

  const [balance, setBalance] = useState(null);
  const [familySettings, setFamilySettings] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Deposit dialog
  const [depositVisible, setDepositVisible] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  // Spend request dialog
  const [spendVisible, setSpendVisible] = useState(false);
  const [spendAmount, setSpendAmount] = useState('');
  const [spendNotes, setSpendNotes] = useState('');
  const [requesting, setRequesting] = useState(false);

  // Withdrawal dialog
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  // Savings confirmation dialog
  const [confirmDepositVisible, setConfirmDepositVisible] = useState(false);
  const [pendingDepositAmount, setPendingDepositAmount] = useState(0);

  // Biometric / quick approve
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Fingerprint');
  const [parentCredsSetUp, setParentCredsSetUp] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  // Parent setup dialog
  const [setupDialogVisible, setSetupDialogVisible] = useState(false);
  const [parentLogin, setParentLogin] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState(null);

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

  const fetchData = async () => {
    try {
      const [balanceData, settingsData, requestsData] = await Promise.all([
        allowanceAPI.getBalance().catch(() => ({ balance: 0, savingsBalance: 0 })),
        familyAPI.getSettings().catch(() => ({ minimumSavingsWithdrawal: 25 })),
        allowanceAPI.getPendingRequests().catch(() => []),
      ]);
      await checkBiometric();
      setBalance(balanceData);
      setFamilySettings(settingsData);
      const list = Array.isArray(requestsData) ? requestsData : [];
      // For children, filter to only their own requests
      if (!parentMode) {
        setPendingRequests(list.filter(r => {
          const childId = r.childId?._id || r.childId;
          return childId === user?._id || childId === user?.id;
        }));
      } else {
        setPendingRequests(list);
      }
    } catch (err) {
      setError('Failed to load wallet data');
    }
  };

  const loadData = async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // --- Deposit to Savings ---
  const openDeposit = () => {
    setDepositAmount('');
    setDepositVisible(true);
  };

  const calcBonusMinutes = (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return 0;
    return Math.floor(num / 0.20) * 5;
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (amount > (balance?.balance || 0)) {
      setError(`Amount exceeds your balance of $${(balance?.balance || 0).toFixed(2)}`);
      return;
    }

    // Show confirmation dialog
    setPendingDepositAmount(amount);
    setDepositVisible(false);
    setConfirmDepositVisible(true);
  };

  const confirmDeposit = async () => {
    setConfirmDepositVisible(false);
    setDepositing(true);
    try {
      const result = await allowanceAPI.depositSavings(pendingDepositAmount);
      setSuccessMsg(`Deposited $${pendingDepositAmount.toFixed(2)} to savings! +${result.bonusMinutes} bonus minutes`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deposit');
    } finally {
      setDepositing(false);
    }
  };

  const cancelDeposit = () => {
    setConfirmDepositVisible(false);
    setDepositVisible(true);
  };

  // --- Request to Spend ---
  const openSpend = () => {
    setSpendAmount('');
    setSpendNotes('');
    setSpendVisible(true);
  };

  const handleSpend = async () => {
    const amount = parseFloat(spendAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (amount > (balance?.balance || 0)) {
      setError(`Amount exceeds your balance of $${(balance?.balance || 0).toFixed(2)}`);
      return;
    }

    setRequesting(true);
    try {
      await allowanceAPI.requestSpend(amount, spendNotes.trim());
      setSuccessMsg('Spend request submitted for approval');
      setSpendVisible(false);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request');
    } finally {
      setRequesting(false);
    }
  };

  // --- Withdraw from Savings ---
  const openWithdraw = () => {
    setWithdrawAmount('');
    setWithdrawNotes('');
    setWithdrawVisible(true);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (amount > (balance?.savingsBalance || 0)) {
      setError(`Amount exceeds your savings of $${(balance?.savingsBalance || 0).toFixed(2)}`);
      return;
    }

    setWithdrawing(true);
    try {
      await allowanceAPI.requestWithdrawal(amount, withdrawNotes.trim());
      setSuccessMsg('Withdrawal request submitted for approval');
      setWithdrawVisible(false);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request');
    } finally {
      setWithdrawing(false);
    }
  };

  // --- Quick Approve for wallet requests ---
  const handleQuickApprove = async (request) => {
    const id = request._id || request.id;

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
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSetupParentCreds = async () => {
    if (!parentLogin.trim() || !parentPassword.trim()) {
      setError('Please enter parent login and password');
      return;
    }

    setSetupSaving(true);
    await saveParentApprovalCredentials(parentLogin.trim().toLowerCase(), parentPassword);
    setParentCredsSetUp(true);
    setSetupDialogVisible(false);

    if (pendingApprovalId) {
      const bioType = await getBiometricType();
      const authResult = await authenticateWithBiometric(
        `Parent: use ${bioType} to approve request`
      );

      if (authResult.success) {
        setProcessingId(pendingApprovalId);
        try {
          await allowanceAPI.quickApproveRequest(pendingApprovalId, parentLogin.trim().toLowerCase(), parentPassword);
          setSuccessMsg('Request approved!');
          await fetchData();
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

  const minWithdrawal = familySettings?.minimumSavingsWithdrawal || 25;
  const canWithdraw = (balance?.savingsBalance || 0) >= minWithdrawal;

  const getTypeLabel = (type) => {
    switch (type) {
      case 'savings_withdrawal': return 'Withdrawal';
      case 'spend_request': return 'Spend Request';
      default: return type;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ff9800';
      case 'approved': return '#4caf50';
      case 'rejected': return '#d32f2f';
      default: return '#888';
    }
  };

  if (parentMode) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: '#666' }}>The wallet is available on child accounts.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#6200ee']}
            tintColor="#6200ee"
          />
        }
      >
        {/* Balance Card */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="My Wallet"
            titleVariant="titleMedium"
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="wallet"
                size={40}
                style={styles.walletIcon}
              />
            )}
          />
          <Card.Content>
            <View style={styles.balanceRow}>
              <View style={styles.balanceBox}>
                <Text variant="headlineSmall" style={styles.balanceValue}>
                  ${(balance?.balance || 0).toFixed(2)}
                </Text>
                <Text variant="labelMedium" style={styles.balanceLabel}>
                  Spendable Balance
                </Text>
              </View>
              <View style={styles.balanceBox}>
                <Text variant="headlineSmall" style={[styles.balanceValue, styles.savingsValue]}>
                  ${(balance?.savingsBalance || 0).toFixed(2)}
                </Text>
                <Text variant="labelMedium" style={styles.balanceLabel}>
                  Savings
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Actions Card */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="Actions"
            titleVariant="titleMedium"
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="swap-horizontal"
                size={40}
                style={styles.sectionIcon}
              />
            )}
          />
          <Card.Content>
            <Button
              mode="contained"
              onPress={openDeposit}
              style={styles.actionButton}
              icon="piggy-bank"
              disabled={(balance?.balance || 0) <= 0}
            >
              Deposit to Savings
            </Button>
            <Button
              mode="contained-tonal"
              onPress={openSpend}
              style={styles.actionButton}
              icon="cart"
              disabled={(balance?.balance || 0) <= 0}
            >
              Request to Spend
            </Button>
            <Button
              mode="outlined"
              onPress={openWithdraw}
              style={styles.actionButton}
              icon="bank-transfer-out"
              disabled={!canWithdraw}
            >
              Withdraw Savings
            </Button>
            {!canWithdraw && (balance?.savingsBalance || 0) > 0 && (
              <Text style={styles.thresholdNote}>
                Need ${minWithdrawal.toFixed(2)} in savings to withdraw (currently ${(balance?.savingsBalance || 0).toFixed(2)})
              </Text>
            )}
            {(balance?.savingsBalance || 0) === 0 && (
              <Text style={styles.thresholdNote}>
                Save at least ${minWithdrawal.toFixed(2)} to unlock withdrawals
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Pending Requests */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="My Requests"
            titleVariant="titleMedium"
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="clock-outline"
                size={40}
                style={styles.sectionIcon}
              />
            )}
          />
          <Card.Content>
            {pendingRequests.length === 0 ? (
              <Text style={styles.emptyText}>No pending requests</Text>
            ) : (
              pendingRequests.map((item, index) => {
                const id = item._id || item.id;
                const isPending = item.status === 'pending';
                const isProcessing = processingId === id;
                return (
                  <View key={id}>
                    {index > 0 && <Divider style={styles.divider} />}
                    <View style={styles.requestRow}>
                      <View style={styles.requestInfo}>
                        <Text variant="bodyMedium" style={styles.requestType}>
                          {getTypeLabel(item.type)}
                        </Text>
                        <Text variant="bodySmall" style={styles.requestNotes}>
                          ${item.amount?.toFixed(2)} {item.notes ? `- ${item.notes}` : ''}
                        </Text>
                        <Text variant="bodySmall" style={styles.requestDate}>
                          {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      {isPending && biometricAvailable ? (
                        <View style={styles.quickApproveButton}>
                          <IconButton
                            icon="fingerprint"
                            iconColor="#6200ee"
                            size={28}
                            onPress={() => handleQuickApprove(item)}
                            disabled={isProcessing}
                          />
                          <Text style={styles.quickApproveLabel}>Approve</Text>
                        </View>
                      ) : (
                        <Chip
                          compact
                          style={{ backgroundColor: getStatusColor(item.status) + '20' }}
                          textStyle={{ color: getStatusColor(item.status), fontSize: 12 }}
                        >
                          {item.status}
                        </Chip>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        {/* Savings Confirmation Dialog */}
        <Dialog visible={confirmDepositVisible} onDismiss={cancelDeposit}>
          <Dialog.Title>Are you sure?</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 8 }}>
              You're about to deposit ${pendingDepositAmount.toFixed(2)} to your savings.
            </Text>
            <Text style={{ marginBottom: 8, color: '#e65100', fontWeight: '600' }}>
              Once money is in savings, you cannot spend it until your savings reaches at least ${minWithdrawal.toFixed(2)}.
            </Text>
            <Text style={{ color: '#2e7d32' }}>
              You'll earn {calcBonusMinutes(pendingDepositAmount)} bonus screen time minutes!
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cancelDeposit}>Go Back</Button>
            <Button onPress={confirmDeposit} loading={depositing}>Yes, Deposit</Button>
          </Dialog.Actions>
        </Dialog>

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

        {/* Deposit Dialog */}
        <Dialog visible={depositVisible} onDismiss={() => setDepositVisible(false)}>
          <Dialog.Title>Deposit to Savings</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 4 }}>
              Available balance: ${(balance?.balance || 0).toFixed(2)}
            </Text>
            <Text style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
              For every $0.20 saved, you earn 5 bonus minutes of screen time!
            </Text>
            <TextInput
              label="Amount ($)"
              value={depositAmount}
              onChangeText={setDepositAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="$" />}
              style={styles.dialogInput}
              disabled={depositing}
            />
            {depositAmount && parseFloat(depositAmount) > 0 && (
              <Text style={styles.bonusPreview}>
                You'll earn {calcBonusMinutes(depositAmount)} bonus minutes!
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDepositVisible(false)} disabled={depositing}>
              Cancel
            </Button>
            <Button onPress={handleDeposit} loading={depositing} disabled={depositing}>
              Deposit
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Spend Request Dialog */}
        <Dialog visible={spendVisible} onDismiss={() => setSpendVisible(false)}>
          <Dialog.Title>Request to Spend</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
              Available balance: ${(balance?.balance || 0).toFixed(2)}. A parent will need to approve this request.
            </Text>
            <TextInput
              label="Amount ($)"
              value={spendAmount}
              onChangeText={setSpendAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="$" />}
              style={styles.dialogInput}
              disabled={requesting}
            />
            <TextInput
              label="What is it for?"
              value={spendNotes}
              onChangeText={setSpendNotes}
              mode="outlined"
              placeholder="e.g. New book, toy, game"
              style={styles.dialogInput}
              disabled={requesting}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSpendVisible(false)} disabled={requesting}>
              Cancel
            </Button>
            <Button onPress={handleSpend} loading={requesting} disabled={requesting}>
              Submit Request
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Withdrawal Dialog */}
        <Dialog visible={withdrawVisible} onDismiss={() => setWithdrawVisible(false)}>
          <Dialog.Title>Withdraw from Savings</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
              Savings balance: ${(balance?.savingsBalance || 0).toFixed(2)}. A parent will need to approve this request.
            </Text>
            <TextInput
              label="Amount ($)"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="$" />}
              style={styles.dialogInput}
              disabled={withdrawing}
            />
            <TextInput
              label="Reason (optional)"
              value={withdrawNotes}
              onChangeText={setWithdrawNotes}
              mode="outlined"
              placeholder="e.g. Birthday purchase"
              style={styles.dialogInput}
              disabled={withdrawing}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setWithdrawVisible(false)} disabled={withdrawing}>
              Cancel
            </Button>
            <Button onPress={handleWithdraw} loading={withdrawing} disabled={withdrawing}>
              Submit Request
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!successMsg} onDismiss={() => setSuccessMsg('')} duration={2500}>
        {successMsg}
      </Snackbar>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={3000}
        action={{ label: 'Dismiss', onPress: () => setError('') }}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  walletIcon: {
    backgroundColor: '#6200ee',
  },
  sectionIcon: {
    backgroundColor: '#ede7f6',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  balanceBox: {
    alignItems: 'center',
    backgroundColor: '#ede7f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flex: 1,
    marginHorizontal: 6,
  },
  balanceValue: {
    color: '#6200ee',
    fontWeight: 'bold',
  },
  savingsValue: {
    color: '#2e7d32',
  },
  balanceLabel: {
    color: '#666',
    marginTop: 4,
  },
  actionButton: {
    marginBottom: 10,
  },
  thresholdNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    paddingVertical: 16,
  },
  divider: {
    marginVertical: 8,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  requestInfo: {
    flex: 1,
  },
  requestType: {
    fontWeight: '600',
  },
  requestNotes: {
    color: '#666',
    marginTop: 2,
  },
  requestDate: {
    color: '#999',
    marginTop: 2,
  },
  dialogInput: {
    marginBottom: 12,
  },
  bonusPreview: {
    color: '#2e7d32',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  quickApproveButton: {
    alignItems: 'center',
  },
  quickApproveLabel: {
    fontSize: 11,
    color: '#6200ee',
    fontWeight: '600',
    marginTop: -6,
  },
});
