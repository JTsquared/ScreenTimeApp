import { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
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
  Switch,
  Menu,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { devicesAPI } from '../../src/api/devices';
import { choresAPI } from '../../src/api/chores';

const DEVICE_TYPES = [
  { label: 'Computer', value: 'computer', icon: 'laptop' },
  { label: 'Tablet', value: 'tablet', icon: 'tablet' },
  { label: 'Phone', value: 'phone', icon: 'cellphone' },
  { label: 'TV', value: 'tv', icon: 'television' },
  { label: 'Game Console', value: 'console', icon: 'gamepad-variant' },
  { label: 'Other', value: 'other', icon: 'devices' },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function DevicesScreen() {
  const { isParent } = useAuth();
  const parentMode = isParent();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Add/Edit device dialog (parent)
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [deviceType, setDeviceType] = useState('computer');
  const [typeMenuVisible, setTypeMenuVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState(null);

  // Screen time request dialog (child)
  const [screenTimeDialogVisible, setScreenTimeDialogVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [availableScreenTime, setAvailableScreenTime] = useState(null);

  // Toggling state
  const [togglingId, setTogglingId] = useState(null);

  const fetchDevices = async () => {
    try {
      const data = await devicesAPI.getDevices();
      setDevices(Array.isArray(data) ? data : data.devices || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load devices');
    }
  };

  const fetchScreenTime = async () => {
    try {
      const data = await choresAPI.getAvailableScreenTime();
      setAvailableScreenTime(data);
    } catch (err) {
      // Parents will get an error here, that's fine
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchDevices(), fetchScreenTime()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDevices(), fetchScreenTime()]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [parentMode])
  );

  const getDeviceIcon = (type) => {
    const match = DEVICE_TYPES.find((dt) => dt.value === type);
    return match ? match.icon : 'devices';
  };

  const getDeviceTypeLabel = (type) => {
    const match = DEVICE_TYPES.find((dt) => dt.value === type);
    return match ? match.label : 'Device';
  };

  // --- Parent: Add/Edit Device ---
  const openAddDialog = () => {
    setEditingDevice(null);
    setDeviceName('');
    setDeviceMac('');
    setDeviceType('computer');
    setDialogVisible(true);
  };

  const openEditDialog = (device) => {
    setEditingDevice(device);
    setDeviceName(device.name || '');
    setDeviceMac(device.macAddress || device.mac || '');
    setDeviceType(device.deviceType || device.type || 'computer');
    setDialogVisible(true);
  };

  const handleSaveDevice = async () => {
    if (!deviceName.trim()) {
      setError('Device name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: deviceName.trim(),
        macAddress: deviceMac.trim(),
        deviceType: deviceType,
      };

      if (editingDevice) {
        await devicesAPI.updateDevice(
          editingDevice._id || editingDevice.id,
          payload
        );
        setSuccessMsg('Device updated');
      } else {
        await devicesAPI.registerDevice(payload);
        setSuccessMsg('Device added');
      }

      setDialogVisible(false);
      await fetchDevices();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save device');
    } finally {
      setSaving(false);
    }
  };

  // --- Parent: Delete Device ---
  const confirmDelete = (device) => {
    setDeviceToDelete(device);
    setDeleteDialogVisible(true);
  };

  const handleDeleteDevice = async () => {
    if (!deviceToDelete) return;
    try {
      await devicesAPI.deleteDevice(deviceToDelete._id || deviceToDelete.id);
      setSuccessMsg('Device deleted');
      setDeleteDialogVisible(false);
      setDeviceToDelete(null);
      await fetchDevices();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete device');
    }
  };

  // --- Parent: Enable/Disable toggle ---
  const handleToggleDevice = async (device) => {
    const id = device._id || device.id;
    setTogglingId(id);
    try {
      if (device.isEnabled || device.enabled) {
        await devicesAPI.disableDevice(id);
        setSuccessMsg(`${device.name} disabled`);
      } else {
        // Parent enabling -- enable indefinitely (pass 0 or a large number)
        await devicesAPI.enableDevice(id, 0);
        setSuccessMsg(`${device.name} enabled`);
      }
      await fetchDevices();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to toggle device');
    } finally {
      setTogglingId(null);
    }
  };

  // --- Child: Request screen time ---
  const openScreenTimeDialog = (device) => {
    setSelectedDevice(device);
    setSelectedDuration(30);
    setScreenTimeDialogVisible(true);
  };

  const getAvailableMinutes = () => {
    if (availableScreenTime == null) return 0;
    if (typeof availableScreenTime === 'number') return availableScreenTime;
    if (availableScreenTime.available != null) return availableScreenTime.available;
    if (availableScreenTime.minutes != null) return availableScreenTime.minutes;
    return 0;
  };

  const handleRequestScreenTime = async () => {
    if (!selectedDevice) return;
    const id = selectedDevice._id || selectedDevice.id;
    setSaving(true);
    try {
      await devicesAPI.enableDevice(id, selectedDuration);
      setSuccessMsg(
        `${selectedDevice.name} enabled for ${selectedDuration} minutes`
      );
      setScreenTimeDialogVisible(false);
      await Promise.all([fetchDevices(), fetchScreenTime()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to enable device');
    } finally {
      setSaving(false);
    }
  };

  // --- Render ---
  const renderDeviceCard = ({ item }) => {
    const id = item._id || item.id;
    const isEnabled = item.isEnabled || item.enabled || false;
    const isToggling = togglingId === id;

    return (
      <Card style={styles.card} mode="elevated">
        <Card.Title
          title={item.name}
          titleVariant="titleMedium"
          subtitle={getDeviceTypeLabel(item.deviceType || item.type)}
          left={(props) => (
            <IconButton
              {...props}
              icon={getDeviceIcon(item.deviceType || item.type)}
              size={28}
              style={styles.deviceIcon}
            />
          )}
          right={(props) =>
            parentMode ? (
              <View style={styles.cardActions}>
                <IconButton
                  icon="pencil"
                  size={20}
                  onPress={() => openEditDialog(item)}
                />
                <IconButton
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
              icon={isEnabled ? 'check-circle' : 'close-circle'}
              style={[
                styles.statusChip,
                isEnabled ? styles.enabledChip : styles.disabledChip,
              ]}
              textStyle={isEnabled ? styles.enabledText : styles.disabledText}
              compact
            >
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Chip>
            {isEnabled && item.enabledUntil && (
              <Chip icon="timer-outline" compact style={styles.chip}>
                {Math.max(0, Math.ceil((new Date(item.enabledUntil) - new Date()) / 60000))} min left
              </Chip>
            )}
            {(item.macAddress || item.mac) && (
              <Chip icon="ethernet" compact style={styles.chip}>
                {item.macAddress || item.mac}
              </Chip>
            )}
          </View>
        </Card.Content>
        <Card.Actions>
          {parentMode ? (
            <Button
              mode={isEnabled ? 'outlined' : 'contained'}
              onPress={() => handleToggleDevice(item)}
              loading={isToggling}
              disabled={isToggling}
              compact
              icon={isEnabled ? 'power-off' : 'power'}
            >
              {isEnabled ? 'Disable' : 'Enable'}
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={() => openScreenTimeDialog(item)}
              compact
              icon="clock-plus-outline"
            >
              Use Screen Time
            </Button>
          )}
        </Card.Actions>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading devices...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Child: screen time balance */}
      {!parentMode && availableScreenTime != null && (
        <Card style={styles.screenTimeCard} mode="elevated">
          <Card.Content style={styles.screenTimeContent}>
            <Text variant="labelLarge" style={styles.screenTimeLabel}>
              Available Screen Time
            </Text>
            <Text variant="headlineMedium" style={styles.screenTimeValue}>
              {getAvailableMinutes()} min
            </Text>
          </Card.Content>
        </Card>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => String(item._id || item.id)}
        renderItem={renderDeviceCard}
        contentContainerStyle={
          devices.length === 0 ? styles.emptyContainer : styles.listContent
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
              No devices yet
            </Text>
            <Text variant="bodyMedium" style={styles.emptySubtext}>
              {parentMode
                ? 'Tap the + button to add a device'
                : 'No devices assigned to you yet'}
            </Text>
          </View>
        }
      />

      {/* Parent: FAB to add device */}
      {parentMode && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={openAddDialog}
          color="#fff"
        />
      )}

      <Portal>
        {/* Add/Edit Device Dialog */}
        <Dialog
          visible={dialogVisible}
          onDismiss={() => setDialogVisible(false)}
        >
          <Dialog.Title>
            {editingDevice ? 'Edit Device' : 'Add Device'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Device Name"
              value={deviceName}
              onChangeText={setDeviceName}
              mode="outlined"
              style={styles.dialogInput}
              disabled={saving}
            />
            <TextInput
              label="MAC Address (optional)"
              value={deviceMac}
              onChangeText={setDeviceMac}
              mode="outlined"
              autoCapitalize="characters"
              style={styles.dialogInput}
              disabled={saving}
            />
            <Text variant="labelLarge" style={styles.fieldLabel}>
              Device Type
            </Text>
            <Menu
              visible={typeMenuVisible}
              onDismiss={() => setTypeMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setTypeMenuVisible(true)}
                  icon={getDeviceIcon(deviceType)}
                  style={styles.typeButton}
                  contentStyle={styles.typeButtonContent}
                  disabled={saving}
                >
                  {getDeviceTypeLabel(deviceType)}
                </Button>
              }
            >
              {DEVICE_TYPES.map((dt) => (
                <Menu.Item
                  key={dt.value}
                  onPress={() => {
                    setDeviceType(dt.value);
                    setTypeMenuVisible(false);
                  }}
                  title={dt.label}
                  leadingIcon={dt.icon}
                />
              ))}
            </Menu>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onPress={handleSaveDevice}
              loading={saving}
              disabled={saving}
            >
              {editingDevice ? 'Update' : 'Add'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Title>Delete Device</Dialog.Title>
          <Dialog.Content>
            <Text>
              Are you sure you want to delete "{deviceToDelete?.name}"? This
              action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>
              Cancel
            </Button>
            <Button onPress={handleDeleteDevice} textColor="#d32f2f">
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Child: Screen Time Request Dialog */}
        <Dialog
          visible={screenTimeDialogVisible}
          onDismiss={() => setScreenTimeDialogVisible(false)}
        >
          <Dialog.Title>Use Screen Time</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 4 }}>
              Enable "{selectedDevice?.name}" for how long?
            </Text>
            <Text variant="bodySmall" style={styles.balanceText}>
              Available: {getAvailableMinutes()} minutes
            </Text>
            <View style={styles.durationGrid}>
              {DURATION_OPTIONS.map((mins) => {
                const available = getAvailableMinutes();
                const disabled = available > 0 && mins > available;
                return (
                  <Chip
                    key={mins}
                    selected={selectedDuration === mins}
                    onPress={() => !disabled && setSelectedDuration(mins)}
                    style={[
                      styles.durationChip,
                      disabled && styles.durationChipDisabled,
                    ]}
                    disabled={disabled}
                    showSelectedCheck
                    compact
                  >
                    {mins} min
                  </Chip>
                );
              })}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setScreenTimeDialogVisible(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onPress={handleRequestScreenTime}
              loading={saving}
              disabled={saving}
            >
              Enable
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
  deviceIcon: {
    backgroundColor: '#ede7f6',
  },
  cardActions: {
    flexDirection: 'row',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    borderWidth: 0,
  },
  enabledChip: {
    backgroundColor: '#e8f5e9',
  },
  disabledChip: {
    backgroundColor: '#fce4ec',
  },
  enabledText: {
    color: '#2e7d32',
  },
  disabledText: {
    color: '#c62828',
  },
  chip: {
    backgroundColor: '#ede7f6',
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
  fieldLabel: {
    marginBottom: 8,
    color: '#333',
  },
  typeButton: {
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  typeButtonContent: {
    justifyContent: 'flex-start',
  },
  balanceText: {
    color: '#6200ee',
    marginBottom: 16,
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationChip: {
    marginBottom: 4,
  },
  durationChipDisabled: {
    opacity: 0.4,
  },
});
