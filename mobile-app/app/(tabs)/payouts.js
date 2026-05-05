import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
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
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { allowanceAPI } from '../../src/api/allowance';

export default function PayoutsScreen() {
  const { isParent } = useAuth();
  const parentMode = isParent();

  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Payout dialog
  const [payoutDialogVisible, setPayoutDialogVisible] = useState(false);
  const [payoutTarget, setPayoutTarget] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const fetchBalances = async () => {
    try {
      const data = await allowanceAPI.getAllBalances();
      setBalances(Array.isArray(data) ? data : data.balances || data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load balances');
    }
  };

  const loadData = async () => {
    setLoading(true);
    await fetchBalances();
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBalances();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (parentMode) loadData();
      else setLoading(false);
    }, [])
  );

  const openPayoutDialog = (child) => {
    setPayoutTarget(child);
    setPayoutAmount('');
    setPayoutNotes('');
    setPayoutDialogVisible(true);
  };

  const handlePayAll = (child) => {
    setPayoutTarget(child);
    setPayoutAmount(String(child.balance));
    setPayoutNotes('');
    setPayoutDialogVisible(true);
  };

  const handlePayout = async () => {
    if (!payoutTarget) return;

    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > payoutTarget.balance) {
      setError(`Amount exceeds balance of $${payoutTarget.balance.toFixed(2)}`);
      return;
    }

    setPaying(true);
    try {
      await allowanceAPI.recordPayout(
        payoutTarget.childId || payoutTarget._id,
        amount,
        payoutNotes.trim() || `Payout to ${payoutTarget.childName}`
      );
      setSuccessMsg(`$${amount.toFixed(2)} paid to ${payoutTarget.childName}`);
      setPayoutDialogVisible(false);
      await fetchBalances();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payout');
    } finally {
      setPaying(false);
    }
  };

  if (!parentMode) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: '#666' }}>Only available for parents.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading balances...</Text>
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
        {balances.length === 0 ? (
          <View style={styles.emptyView}>
            <Text variant="titleMedium" style={styles.emptyText}>No children found</Text>
            <Text variant="bodyMedium" style={styles.emptySubtext}>
              Add children in Settings to track their allowance
            </Text>
          </View>
        ) : (
          balances.map((child) => (
            <Card key={child.childId} style={styles.card} mode="elevated">
              <Card.Title
                title={child.childName}
                titleVariant="titleMedium"
                subtitle={`$${child.allowanceRate?.toFixed(2) || '0.00'}/hr`}
                left={(props) => (
                  <Avatar.Icon
                    {...props}
                    icon="account-child"
                    size={40}
                    style={styles.avatar}
                  />
                )}
              />
              <Card.Content>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceItem}>
                    <Text variant="labelSmall" style={styles.balanceLabel}>Balance</Text>
                    <Text variant="titleMedium" style={[
                      styles.currentBalance,
                      child.balance > 0 && styles.positiveBalance,
                    ]}>
                      ${child.balance?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                  <View style={styles.balanceItem}>
                    <Text variant="labelSmall" style={styles.balanceLabel}>Paid Out</Text>
                    <Text variant="titleMedium" style={styles.paidOutValue}>
                      ${child.totalPaidOut?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                </View>
              </Card.Content>
              {child.balance > 0 && (
                <Card.Actions>
                  <Button
                    mode="outlined"
                    onPress={() => openPayoutDialog(child)}
                    compact
                    icon="cash"
                  >
                    Custom
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => handlePayAll(child)}
                    compact
                    icon="cash-fast"
                  >
                    Pay All (${child.balance.toFixed(2)})
                  </Button>
                </Card.Actions>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <Portal>
        <Dialog
          visible={payoutDialogVisible}
          onDismiss={() => setPayoutDialogVisible(false)}
        >
          <Dialog.Title>Record Payout</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 4 }}>
              Pay {payoutTarget?.childName}
            </Text>
            <Text variant="bodySmall" style={{ marginBottom: 12, color: '#666' }}>
              Available balance: ${payoutTarget?.balance?.toFixed(2) || '0.00'}
            </Text>
            <TextInput
              label="Amount ($)"
              value={payoutAmount}
              onChangeText={setPayoutAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="$" />}
              style={styles.dialogInput}
              disabled={paying}
            />
            <TextInput
              label="Notes (optional)"
              value={payoutNotes}
              onChangeText={setPayoutNotes}
              mode="outlined"
              placeholder="e.g. Transferred to savings account"
              style={styles.dialogInput}
              disabled={paying}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPayoutDialogVisible(false)} disabled={paying}>
              Cancel
            </Button>
            <Button onPress={handlePayout} loading={paying} disabled={paying}>
              Record Payout
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
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  avatar: {
    backgroundColor: '#ede7f6',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  balanceItem: {
    alignItems: 'center',
    flex: 1,
  },
  balanceLabel: {
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  balanceValue: {
    color: '#333',
  },
  paidOutValue: {
    color: '#888',
  },
  currentBalance: {
    color: '#333',
    fontWeight: 'bold',
  },
  positiveBalance: {
    color: '#4caf50',
  },
  dialogInput: {
    marginBottom: 12,
  },
});
