import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  Card,
  Text,
  Button,
  FAB,
  Dialog,
  Portal,
  TextInput,
  Snackbar,
  ActivityIndicator,
  IconButton,
  Chip,
  Divider,
  SegmentedButtons,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { choresAPI } from '../../src/api/chores';

export default function ChoresScreen() {
  const { isParent, user } = useAuth();
  const parentMode = isParent();

  const [chores, setChores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingChore, setEditingChore] = useState(null);
  const [choreName, setChoreName] = useState('');
  const [choreScreenTime, setChoreScreenTime] = useState('');
  const [choreEstimatedTime, setChoreEstimatedTime] = useState('');
  const [choreType, setChoreType] = useState('recurring');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [choreToDelete, setChoreToDelete] = useState(null);

  // Complete chore dialog (child)
  const [completeDialogVisible, setCompleteDialogVisible] = useState(false);
  const [choreToComplete, setChoreToComplete] = useState(null);
  const [completeNotes, setCompleteNotes] = useState('');

  // Screen time display for children
  const [availableScreenTime, setAvailableScreenTime] = useState(null);

  const fetchChores = async () => {
    try {
      const data = await choresAPI.getChores();
      setChores(Array.isArray(data) ? data : data.chores || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load chores');
    }
  };

  const fetchScreenTime = async () => {
    if (!parentMode) {
      try {
        const data = await choresAPI.getAvailableScreenTime();
        setAvailableScreenTime(data);
      } catch (err) {
        // Silently fail - screen time balance is supplementary info
      }
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchChores(), fetchScreenTime()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchChores(), fetchScreenTime()]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // --- Parent: Create/Edit chore ---
  const openCreateDialog = () => {
    setEditingChore(null);
    setChoreName('');
    setChoreScreenTime('');
    setChoreEstimatedTime('');
    setChoreType('recurring');
    setDialogVisible(true);
  };

  const openEditDialog = (chore) => {
    setEditingChore(chore);
    setChoreName(chore.name || '');
    setChoreScreenTime(
      chore.screenTimeMinutes != null ? String(chore.screenTimeMinutes) : ''
    );
    setChoreEstimatedTime(
      chore.estimatedMinutes != null ? String(chore.estimatedMinutes) : ''
    );
    setChoreType(chore.choreType || 'recurring');
    setDialogVisible(true);
  };

  const handleSaveChore = async () => {
    if (!choreName.trim()) {
      setError('Chore name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: choreName.trim(),
        screenTimeMinutes: choreScreenTime ? parseInt(choreScreenTime, 10) : 0,
        estimatedMinutes: choreEstimatedTime ? parseInt(choreEstimatedTime, 10) : 0,
        choreType,
      };

      if (editingChore) {
        await choresAPI.updateChore(editingChore._id || editingChore.id, payload);
        setSuccessMsg('Chore updated');
      } else {
        await choresAPI.createChore(payload);
        setSuccessMsg('Chore created');
      }

      setDialogVisible(false);
      await fetchChores();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save chore');
    } finally {
      setSaving(false);
    }
  };

  // --- Parent: Delete chore ---
  const confirmDelete = (chore) => {
    setChoreToDelete(chore);
    setDeleteDialogVisible(true);
  };

  const handleDeleteChore = async () => {
    if (!choreToDelete) return;
    try {
      await choresAPI.deleteChore(choreToDelete._id || choreToDelete.id);
      setSuccessMsg('Chore deleted');
      setDeleteDialogVisible(false);
      setChoreToDelete(null);
      await fetchChores();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete chore');
    }
  };

  // --- Child: Complete chore ---
  const openCompleteDialog = (chore) => {
    setChoreToComplete(chore);
    setCompleteNotes('');
    setCompleteDialogVisible(true);
  };

  const handleCompleteChore = async () => {
    if (!choreToComplete) return;
    setSaving(true);
    try {
      await choresAPI.completeChore(
        choreToComplete._id || choreToComplete.id,
        completeNotes
      );
      setSuccessMsg('Chore marked as complete! Waiting for approval.');
      setCompleteDialogVisible(false);
      setChoreToComplete(null);
      await Promise.all([fetchChores(), fetchScreenTime()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete chore');
    } finally {
      setSaving(false);
    }
  };

  // --- Render ---
  const renderChoreCard = ({ item }) => {
    const choreId = item._id || item.id;
    return (
      <Card style={styles.card} mode="elevated">
        <Card.Title
          title={item.name}
          titleVariant="titleMedium"
          right={(props) =>
            parentMode ? (
              <View style={styles.cardActions}>
                <IconButton
                  {...props}
                  icon="pencil"
                  size={20}
                  onPress={() => openEditDialog(item)}
                />
                <IconButton
                  {...props}
                  icon="delete"
                  size={20}
                  iconColor="#d32f2f"
                  onPress={() => confirmDelete(item)}
                />
              </View>
            ) : null
          }
        />
        <Card.Content>
          <View style={styles.chipRow}>
            <Chip
              icon={item.choreType === 'one-time' ? 'numeric-1-circle' : 'repeat'}
              style={item.choreType === 'one-time' ? styles.oneTimeChip : styles.chip}
              compact
            >
              {item.choreType === 'one-time' ? 'One-time' : 'Recurring'}
            </Chip>
            {item.screenTimeMinutes > 0 && (
              <Chip icon="clock-outline" style={styles.chip} compact>
                {item.screenTimeMinutes} min screen time
              </Chip>
            )}
            {item.estimatedMinutes > 0 && (
              <Chip icon="timer-outline" style={styles.chip} compact>
                ~{item.estimatedMinutes} min to complete
              </Chip>
            )}
          </View>
        </Card.Content>
        {!parentMode && (
          <Card.Actions>
            <Button
              mode="contained"
              compact
              onPress={() => openCompleteDialog(item)}
              icon="check"
            >
              Mark Complete
            </Button>
          </Card.Actions>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading chores...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Child: show available screen time */}
      {!parentMode && availableScreenTime != null && (
        <Card style={styles.screenTimeCard} mode="elevated">
          <Card.Content style={styles.screenTimeContent}>
            <Text variant="labelLarge" style={styles.screenTimeLabel}>
              Available Screen Time
            </Text>
            <Text variant="headlineMedium" style={styles.screenTimeValue}>
              {availableScreenTime.available != null
                ? `${availableScreenTime.available} min`
                : typeof availableScreenTime === 'number'
                ? `${availableScreenTime} min`
                : '0 min'}
            </Text>
          </Card.Content>
        </Card>
      )}

      <FlatList
        data={chores}
        keyExtractor={(item) => String(item._id || item.id)}
        renderItem={renderChoreCard}
        contentContainerStyle={
          chores.length === 0 ? styles.emptyContainer : styles.listContent
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
          <View style={styles.emptyView}>
            <Text variant="titleMedium" style={styles.emptyText}>
              No chores yet
            </Text>
            <Text variant="bodyMedium" style={styles.emptySubtext}>
              {parentMode
                ? 'Tap the + button to create a chore'
                : 'No chores available right now'}
            </Text>
          </View>
        }
      />

      {/* Parent: FAB to add chore */}
      {parentMode && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={openCreateDialog}
          color="#fff"
        />
      )}

      {/* Create/Edit Dialog */}
      <Portal>
        <Dialog
          visible={dialogVisible}
          onDismiss={() => setDialogVisible(false)}
        >
          <Dialog.Title>
            {editingChore ? 'Edit Chore' : 'New Chore'}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="labelLarge" style={styles.fieldLabel}>Type</Text>
            <SegmentedButtons
              value={choreType}
              onValueChange={setChoreType}
              buttons={[
                { value: 'recurring', label: 'Recurring', icon: 'repeat' },
                { value: 'one-time', label: 'One-time', icon: 'numeric-1-circle' },
              ]}
              style={styles.dialogInput}
              disabled={saving}
            />
            <TextInput
              label="Chore Name"
              value={choreName}
              onChangeText={setChoreName}
              mode="outlined"
              style={styles.dialogInput}
              disabled={saving}
            />
            <TextInput
              label="Screen Time (minutes)"
              value={choreScreenTime}
              onChangeText={setChoreScreenTime}
              mode="outlined"
              keyboardType="numeric"
              style={styles.dialogInput}
              disabled={saving}
            />
            <TextInput
              label="Estimated Time (minutes)"
              value={choreEstimatedTime}
              onChangeText={setChoreEstimatedTime}
              mode="outlined"
              keyboardType="numeric"
              style={styles.dialogInput}
              disabled={saving}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onPress={handleSaveChore}
              loading={saving}
              disabled={saving}
            >
              {editingChore ? 'Update' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Title>Delete Chore</Dialog.Title>
          <Dialog.Content>
            <Text>
              Are you sure you want to delete "{choreToDelete?.name}"? This
              action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>
              Cancel
            </Button>
            <Button onPress={handleDeleteChore} textColor="#d32f2f">
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Complete Chore Dialog (Child) */}
        <Dialog
          visible={completeDialogVisible}
          onDismiss={() => setCompleteDialogVisible(false)}
        >
          <Dialog.Title>Complete Chore</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12 }}>
              Mark "{choreToComplete?.name}" as complete?
            </Text>
            <TextInput
              label="Notes (optional)"
              value={completeNotes}
              onChangeText={setCompleteNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
              disabled={saving}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setCompleteDialogVisible(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onPress={handleCompleteChore}
              loading={saving}
              disabled={saving}
            >
              Complete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Success Snackbar */}
      <Snackbar
        visible={!!successMsg}
        onDismiss={() => setSuccessMsg('')}
        duration={2500}
      >
        {successMsg}
      </Snackbar>

      {/* Error Snackbar */}
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
  screenTimeCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#ede7f6',
  },
  screenTimeContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  screenTimeLabel: {
    color: '#5e35b1',
  },
  screenTimeValue: {
    color: '#6200ee',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
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
  cardActions: {
    flexDirection: 'row',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#ede7f6',
  },
  oneTimeChip: {
    backgroundColor: '#fff3e0',
  },
  fieldLabel: {
    marginBottom: 8,
    color: '#333',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#6200ee',
  },
  dialogInput: {
    marginBottom: 12,
  },
});
