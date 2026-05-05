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
  List,
  Divider,
  Avatar,
  SegmentedButtons,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { usersAPI } from '../../src/api/users';
import { authAPI } from '../../src/api/auth';
import { allowanceAPI } from '../../src/api/allowance';
import { familyAPI } from '../../src/api/family';
import { choresAPI } from '../../src/api/chores';
import { isBiometricAvailable, getBiometricType, isBiometricLoginEnabled, disableBiometricLogin } from '../../src/utils/biometric';

export default function SettingsScreen() {
  const { user, isParent, logout } = useAuth();
  const parentMode = isParent();
  const router = useRouter();

  const [familyMembers, setFamilyMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Add family member dialog
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberUsername, setMemberUsername] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState('child');
  const [addingMember, setAddingMember] = useState(false);

  // Allowance rate dialog
  const [rateDialogVisible, setRateDialogVisible] = useState(false);
  const [rateTarget, setRateTarget] = useState(null);
  const [newRate, setNewRate] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  // Allowance balances
  const [balances, setBalances] = useState([]);

  // Child-specific stats
  const [childBalance, setChildBalance] = useState(null);
  const [childScreenTime, setChildScreenTime] = useState(null);

  // Reset member password dialog
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Change password dialog
  const [passwordDialogVisible, setPasswordDialogVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Family settings
  const [familySettings, setFamilySettings] = useState(null);
  const [familySettingsDialogVisible, setFamilySettingsDialogVisible] = useState(false);
  const [newMinWithdrawal, setNewMinWithdrawal] = useState('');
  const [savingFamilySettings, setSavingFamilySettings] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');

  // Logout confirmation
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  const fetchFamilyMembers = async () => {
    try {
      const data = await usersAPI.getFamilyMembers();
      setFamilyMembers(
        Array.isArray(data) ? data : data.members || data.users || []
      );
    } catch (err) {
      // Non-critical, may just not have members yet
    }
  };

  const fetchBalances = async () => {
    if (parentMode) {
      try {
        const data = await allowanceAPI.getAllBalances();
        setBalances(
          Array.isArray(data) ? data : data.balances || data.data || []
        );
      } catch (err) {
        // Non-critical
      }
    }
  };

  const fetchChildStats = async () => {
    if (!parentMode) {
      try {
        const [balanceData, screenTimeData] = await Promise.all([
          allowanceAPI.getBalance(),
          choresAPI.getAvailableScreenTime(),
        ]);
        setChildBalance(balanceData);
        setChildScreenTime(screenTimeData);
      } catch (err) {
        // Non-critical
      }
    }
  };

  const fetchFamilySettings = async () => {
    if (parentMode) {
      try {
        const data = await familyAPI.getSettings();
        setFamilySettings(data);
      } catch (err) {
        // Non-critical
      }
    }
  };

  const checkBiometric = async () => {
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);
    if (available) {
      const type = await getBiometricType();
      setBiometricType(type || 'Biometric');
      const enabled = await isBiometricLoginEnabled();
      setBiometricEnabled(enabled);
    }
  };

  const handleDisableBiometric = async () => {
    await disableBiometricLogin();
    setBiometricEnabled(false);
    setSuccessMsg(`${biometricType} login disabled`);
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchFamilyMembers(), fetchBalances(), fetchChildStats(), fetchFamilySettings(), checkBiometric()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchFamilyMembers(), fetchBalances(), fetchChildStats(), fetchFamilySettings()]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // --- Add Family Member ---
  const openAddMember = () => {
    setMemberName('');
    setMemberEmail('');
    setMemberUsername('');
    setMemberPassword('');
    setMemberRole('child');
    setAddMemberVisible(true);
  };

  const handleAddMember = async () => {
    if (!memberName.trim() || !memberPassword.trim()) {
      setError('Name and password are required');
      return;
    }
    if (memberRole === 'child' && !memberUsername.trim()) {
      setError('Username is required for children');
      return;
    }
    if (memberRole === 'parent' && !memberEmail.trim()) {
      setError('Email is required for parents');
      return;
    }

    setAddingMember(true);
    try {
      const memberData = {
        name: memberName.trim(),
        password: memberPassword,
        role: memberRole,
      };
      if (memberRole === 'child') {
        memberData.username = memberUsername.toLowerCase().trim();
      } else {
        memberData.email = memberEmail.toLowerCase().trim();
      }
      await authAPI.addFamilyMember(memberData);
      setSuccessMsg('Family member added');
      setAddMemberVisible(false);
      await fetchFamilyMembers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add family member');
    } finally {
      setAddingMember(false);
    }
  };

  // --- Allowance Rate ---
  const openRateDialog = (member) => {
    setRateTarget(member);
    setNewRate(
      member.allowanceRate != null ? String(member.allowanceRate) : ''
    );
    setRateDialogVisible(true);
  };

  const handleUpdateRate = async () => {
    if (!rateTarget) return;
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) {
      setError('Please enter a valid rate');
      return;
    }

    setSavingRate(true);
    try {
      await allowanceAPI.updateAllowanceRate(
        rateTarget._id || rateTarget.id,
        rate
      );
      setSuccessMsg('Allowance rate updated');
      setRateDialogVisible(false);
      await Promise.all([fetchFamilyMembers(), fetchBalances()]);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Failed to update allowance rate'
      );
    } finally {
      setSavingRate(false);
    }
  };

  // --- Reset Member Password ---
  const openResetPassword = (member) => {
    setResetTarget(member);
    setResetNewPassword('');
    setResetPasswordVisible(true);
  };

  const handleResetPassword = async () => {
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setResettingPassword(true);
    try {
      await usersAPI.resetMemberPassword(resetTarget._id || resetTarget.id, resetNewPassword);
      setSuccessMsg(`Password reset for ${resetTarget.name}`);
      setResetPasswordVisible(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  // --- Change Password ---
  const openPasswordDialog = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordDialogVisible(true);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('All fields are required');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    try {
      await usersAPI.changePassword(currentPassword, newPassword);
      setSuccessMsg('Password changed successfully');
      setPasswordDialogVisible(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  // --- Family Settings ---
  const openFamilySettingsDialog = () => {
    setNewMinWithdrawal(
      familySettings?.minimumSavingsWithdrawal != null
        ? String(familySettings.minimumSavingsWithdrawal)
        : '25'
    );
    setFamilySettingsDialogVisible(true);
  };

  const handleUpdateFamilySettings = async () => {
    const value = parseFloat(newMinWithdrawal);
    if (isNaN(value) || value < 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSavingFamilySettings(true);
    try {
      await familyAPI.updateSettings({ minimumSavingsWithdrawal: value });
      setSuccessMsg('Family settings updated');
      setFamilySettingsDialogVisible(false);
      await fetchFamilySettings();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSavingFamilySettings(false);
    }
  };

  // --- Logout ---
  const handleLogout = async () => {
    setLogoutDialogVisible(false);
    await logout();
    router.replace('/');
  };

  const getMemberBalance = (memberId) => {
    const entry = balances.find(
      (b) =>
        (b._id || b.id || b.childId) === memberId
    );
    return entry?.balance ?? entry?.amount ?? null;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  const children = familyMembers.filter((m) => m.role === 'child');
  const parents = familyMembers.filter((m) => m.role === 'parent');

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
        {/* User Profile Card */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title={user?.name || 'User'}
            titleVariant="titleLarge"
            subtitle={user?.email || (user?.username ? `@${user.username}` : '')}
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon={parentMode ? 'account-supervisor' : 'account'}
                size={48}
                style={styles.avatar}
              />
            )}
          />
          <Card.Content>
            <View style={styles.chipRow}>
              <View style={styles.infoBadge}>
                <Text variant="labelSmall" style={styles.infoBadgeLabel}>
                  Role
                </Text>
                <Text variant="bodyMedium" style={styles.infoBadgeValue}>
                  {parentMode ? 'Parent' : 'Child'}
                </Text>
              </View>
              {user?.familyName && (
                <View style={styles.infoBadge}>
                  <Text variant="labelSmall" style={styles.infoBadgeLabel}>
                    Family
                  </Text>
                  <Text variant="bodyMedium" style={styles.infoBadgeValue}>
                    {user.familyName}
                  </Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Family Members */}
        {parentMode && (
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="Family Members"
            titleVariant="titleMedium"
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="account-group"
                size={40}
                style={styles.sectionIcon}
              />
            )}
            right={(props) =>
              parentMode ? (
                <Button
                  mode="contained-tonal"
                  onPress={openAddMember}
                  compact
                  style={{ marginRight: 16 }}
                  icon="account-plus"
                >
                  Add
                </Button>
              ) : null
            }
          />
          <Card.Content>
            {familyMembers.length === 0 ? (
              <Text style={styles.emptyText}>No family members found</Text>
            ) : (
              <>
                {parents.length > 0 && (
                  <>
                    <Text variant="labelLarge" style={styles.sectionLabel}>
                      Parents
                    </Text>
                    {parents.map((member) => (
                      <List.Item
                        key={member._id || member.id}
                        title={member.name}
                        description={member.email}
                        left={(props) => (
                          <List.Icon {...props} icon="account-supervisor" />
                        )}
                      />
                    ))}
                  </>
                )}
                {children.length > 0 && (
                  <>
                    <Divider style={styles.divider} />
                    <Text variant="labelLarge" style={styles.sectionLabel}>
                      Children
                    </Text>
                    {children.map((member) => {
                      const memberId = member._id || member.id;
                      const balance = getMemberBalance(memberId);
                      return (
                        <List.Item
                          key={memberId}
                          title={member.name}
                          description={
                            `$${(member.allowanceRate ?? 2).toFixed(2)}/hr` +
                            (balance != null ? ` · Balance: $${Number(balance).toFixed(2)}` : '') +
                            (member.username ? ` · @${member.username}` : '')
                          }
                          left={(props) => (
                            <List.Icon {...props} icon="account-child" />
                          )}
                          right={(props) =>
                            parentMode ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Button
                                  compact
                                  mode="text"
                                  onPress={() => openRateDialog(member)}
                                  icon="cash"
                                >
                                  Rate
                                </Button>
                                <Button
                                  compact
                                  mode="text"
                                  onPress={() => openResetPassword(member)}
                                  icon="lock-reset"
                                >
                                  Reset PW
                                </Button>
                              </View>
                            ) : null
                          }
                        />
                      );
                    })}
                  </>
                )}
              </>
            )}
          </Card.Content>
        </Card>
        )}

        {/* Family Settings */}
        {parentMode && (
          <Card style={styles.card} mode="elevated">
            <Card.Title
              title="Family Settings"
              titleVariant="titleMedium"
              left={(props) => (
                <Avatar.Icon
                  {...props}
                  icon="cog"
                  size={40}
                  style={styles.sectionIcon}
                />
              )}
            />
            <Card.Content>
              <View style={styles.familySettingRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">Family Invite Code</Text>
                  <Text variant="bodySmall" style={{ color: '#666' }}>
                    Share this code with another parent to join your family.
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#6200ee', letterSpacing: 2 }}>
                    {familySettings?.inviteCode || '---'}
                  </Text>
                  <Button
                    compact
                    mode="text"
                    onPress={async () => {
                      try {
                        await familyAPI.regenerateInviteCode();
                        setSuccessMsg('Invite code regenerated');
                        await fetchFamilySettings();
                      } catch (err) {
                        setError('Failed to regenerate code');
                      }
                    }}
                    icon="refresh"
                    style={{ marginTop: -4 }}
                  >
                    Regenerate
                  </Button>
                </View>
              </View>
              <Divider style={{ marginVertical: 12 }} />
              <View style={styles.familySettingRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">Minimum Savings for Withdrawal</Text>
                  <Text variant="bodySmall" style={{ color: '#666' }}>
                    Children need at least this much saved before they can request a withdrawal.
                  </Text>
                </View>
                <Button
                  mode="contained-tonal"
                  onPress={openFamilySettingsDialog}
                  compact
                >
                  ${familySettings?.minimumSavingsWithdrawal != null
                    ? Number(familySettings.minimumSavingsWithdrawal).toFixed(2)
                    : '25.00'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Biometric toggle */}
        {biometricAvailable && biometricEnabled && (
          <Button
            mode="outlined"
            onPress={handleDisableBiometric}
            style={styles.changePasswordButton}
            icon="fingerprint-off"
          >
            Disable {biometricType} Login
          </Button>
        )}

        {/* Change Password */}
        <Button
          mode="outlined"
          onPress={openPasswordDialog}
          style={styles.changePasswordButton}
          icon="lock-reset"
        >
          Change Password
        </Button>

        {/* Logout */}
      </ScrollView>

      <Portal>
        {/* Add Family Member Dialog */}
        <Dialog
          visible={addMemberVisible}
          onDismiss={() => setAddMemberVisible(false)}
        >
          <Dialog.Title>Add Family Member</Dialog.Title>
          <Dialog.Content>
            <Text variant="labelLarge" style={styles.fieldLabel}>
              Role
            </Text>
            <SegmentedButtons
              value={memberRole}
              onValueChange={setMemberRole}
              buttons={[
                {
                  value: 'child',
                  label: 'Child',
                  icon: 'account-child',
                },
                {
                  value: 'parent',
                  label: 'Parent',
                  icon: 'account-supervisor',
                },
              ]}
              style={styles.dialogInput}
              disabled={addingMember}
            />
            <TextInput
              label="Name"
              value={memberName}
              onChangeText={setMemberName}
              mode="outlined"
              autoCapitalize="words"
              style={styles.dialogInput}
              disabled={addingMember}
            />
            {memberRole === 'child' ? (
              <TextInput
                label="Username"
                value={memberUsername}
                onChangeText={setMemberUsername}
                mode="outlined"
                autoCapitalize="none"
                style={styles.dialogInput}
                disabled={addingMember}
              />
            ) : (
              <TextInput
                label="Email"
                value={memberEmail}
                onChangeText={setMemberEmail}
                mode="outlined"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.dialogInput}
                disabled={addingMember}
              />
            )}
            <TextInput
              label="Password"
              value={memberPassword}
              onChangeText={setMemberPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
              disabled={addingMember}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setAddMemberVisible(false)}
              disabled={addingMember}
            >
              Cancel
            </Button>
            <Button
              onPress={handleAddMember}
              loading={addingMember}
              disabled={addingMember}
            >
              Add Member
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Allowance Rate Dialog */}
        <Dialog
          visible={rateDialogVisible}
          onDismiss={() => setRateDialogVisible(false)}
        >
          <Dialog.Title>Allowance Rate</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 4 }}>
              Set the hourly pay rate for {rateTarget?.name}
            </Text>
            <Text style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
              This rate is multiplied by each chore's estimated time to determine payout. e.g. $2/hr rate on a 30-min chore = $1.00 earned.
            </Text>
            <TextInput
              label="Rate ($/hour)"
              value={newRate}
              onChangeText={setNewRate}
              mode="outlined"
              keyboardType="decimal-pad"
              disabled={savingRate}
              left={<TextInput.Affix text="$" />}
              right={<TextInput.Affix text="/hr" />}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setRateDialogVisible(false)}
              disabled={savingRate}
            >
              Cancel
            </Button>
            <Button
              onPress={handleUpdateRate}
              loading={savingRate}
              disabled={savingRate}
            >
              Update
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Reset Member Password Dialog */}
        <Dialog
          visible={resetPasswordVisible}
          onDismiss={() => setResetPasswordVisible(false)}
        >
          <Dialog.Title>Reset Password</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12 }}>
              Set a new password for {resetTarget?.name}
            </Text>
            <TextInput
              label="New Password"
              value={resetNewPassword}
              onChangeText={setResetNewPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
              disabled={resettingPassword}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setResetPasswordVisible(false)}
              disabled={resettingPassword}
            >
              Cancel
            </Button>
            <Button
              onPress={handleResetPassword}
              loading={resettingPassword}
              disabled={resettingPassword}
            >
              Reset
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Family Settings Dialog */}
        <Dialog
          visible={familySettingsDialogVisible}
          onDismiss={() => setFamilySettingsDialogVisible(false)}
        >
          <Dialog.Title>Minimum Savings Withdrawal</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
              Set the minimum amount a child must have saved before they can request a withdrawal.
            </Text>
            <TextInput
              label="Amount ($)"
              value={newMinWithdrawal}
              onChangeText={setNewMinWithdrawal}
              mode="outlined"
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="$" />}
              disabled={savingFamilySettings}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setFamilySettingsDialogVisible(false)}
              disabled={savingFamilySettings}
            >
              Cancel
            </Button>
            <Button
              onPress={handleUpdateFamilySettings}
              loading={savingFamilySettings}
              disabled={savingFamilySettings}
            >
              Update
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog
          visible={passwordDialogVisible}
          onDismiss={() => setPasswordDialogVisible(false)}
        >
          <Dialog.Title>Change Password</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
              disabled={changingPassword}
            />
            <TextInput
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
              disabled={changingPassword}
            />
            <TextInput
              label="Confirm New Password"
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
              disabled={changingPassword}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setPasswordDialogVisible(false)}
              disabled={changingPassword}
            >
              Cancel
            </Button>
            <Button
              onPress={handleChangePassword}
              loading={changingPassword}
              disabled={changingPassword}
            >
              Update
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  avatar: {
    backgroundColor: '#6200ee',
  },
  sectionIcon: {
    backgroundColor: '#ede7f6',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  infoBadge: {
    backgroundColor: '#ede7f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  infoBadgeLabel: {
    color: '#5e35b1',
    textTransform: 'uppercase',
  },
  infoBadgeValue: {
    color: '#333',
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 4,
    color: '#6200ee',
  },
  divider: {
    marginVertical: 8,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    paddingVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#ede7f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flex: 1,
    marginHorizontal: 6,
  },
  statValue: {
    color: '#6200ee',
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    marginTop: 4,
  },
  rateText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  changePasswordButton: {
    marginTop: 8,
  },
  logoutButton: {
    marginTop: 8,
    borderColor: '#d32f2f',
  },
  dialogInput: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginBottom: 8,
    color: '#333',
  },
  familySettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
