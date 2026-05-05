import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import {
  Card,
  Text,
  Avatar,
  ActivityIndicator,
  Snackbar,
  Divider,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { allowanceAPI } from '../../src/api/allowance';
import { choresAPI } from '../../src/api/chores';
import { devicesAPI } from '../../src/api/devices';

export default function ProfileScreen() {
  const { user } = useAuth();

  const [childBalance, setChildBalance] = useState(null);
  const [childScreenTime, setChildScreenTime] = useState(null);
  const [completions, setCompletions] = useState([]);
  const [allCompletions, setAllCompletions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statsExpanded, setStatsExpanded] = useState(false);

  const fetchStats = async () => {
    try {
      const [balanceData, screenTimeData, completionData, sessionData] = await Promise.all([
        allowanceAPI.getBalance().catch(() => ({ balance: 0, totalEarned: 0, totalPaidOut: 0 })),
        choresAPI.getAvailableScreenTime().catch(() => ({ available: 0, totalUsed: 0 })),
        choresAPI.getMyCompletions().catch(() => []),
        devicesAPI.getMySessions().catch(() => []),
      ]);
      setChildBalance(balanceData);
      setChildScreenTime(screenTimeData);
      const list = Array.isArray(completionData) ? completionData : completionData.completions || [];
      setAllCompletions(list);
      setCompletions(list.slice(0, 10));
      const sessionList = Array.isArray(sessionData) ? sessionData : [];
      setSessions(sessionList);
    } catch (err) {
      setError('Failed to load profile data');
    }
  };

  const loadData = async () => {
    setLoading(true);
    await fetchStats();
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const getMinutesEarned = (days) => {
    const approved = allCompletions.filter(c => c.status === 'approved');
    let filtered = approved;
    if (days !== null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = approved.filter(c => new Date(c.approvedAt || c.completedAt) >= cutoff);
    }
    return filtered.reduce((sum, c) => {
      const mins = c.choreId?.screenTimeMinutes || c.chore?.screenTimeMinutes || 0;
      return sum + mins;
    }, 0);
  };

  const getAllowanceEarned = (days) => {
    const approved = allCompletions.filter(c => c.status === 'approved');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = approved.filter(c => new Date(c.approvedAt || c.completedAt) >= cutoff);
    const rate = user?.allowanceRate ?? 0;
    const total = filtered.reduce((sum, c) => {
      const mins = c.choreId?.estimatedMinutes || c.chore?.estimatedMinutes || 0;
      return sum + (rate * mins / 60);
    }, 0);
    return total.toFixed(2);
  };

  const getMinutesUsed = (days) => {
    let filtered = sessions;
    if (days !== null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = sessions.filter(s => new Date(s.startedAt) >= cutoff);
    }
    return filtered.reduce((sum, s) => sum + (s.minutesAllocated || 0), 0);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.loadingText}>Loading profile...</Text>
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
        {/* Profile Card */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title={user?.name || 'User'}
            titleVariant="titleLarge"
            subtitle={user?.username ? `@${user.username}` : ''}
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="account"
                size={48}
                style={styles.avatar}
              />
            )}
          />
        </Card>

        {/* Stats */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="My Stats"
            titleVariant="titleMedium"
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="chart-bar"
                size={40}
                style={styles.sectionIcon}
              />
            )}
            right={() => (
              <IconButton
                icon={statsExpanded ? 'chevron-up' : 'chevron-down'}
                onPress={() => setStatsExpanded(!statsExpanded)}
              />
            )}
          />
          <Card.Content>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text variant="titleMedium" style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>
                  ${childBalance?.balance != null ? Number(childBalance.balance).toFixed(2) : '0.00'}
                </Text>
                <Text variant="labelSmall" style={styles.statLabel}>
                  Balance
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text variant="titleMedium" style={styles.savingsValue} numberOfLines={1} adjustsFontSizeToFit>
                  ${childBalance?.savingsBalance != null ? Number(childBalance.savingsBalance).toFixed(2) : '0.00'}
                </Text>
                <Text variant="labelSmall" style={styles.statLabel}>
                  Savings
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text variant="titleMedium" style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  {childScreenTime?.available ?? 0}
                </Text>
                <Text variant="labelSmall" style={styles.statLabel}>
                  Minutes
                </Text>
              </View>
            </View>
            {user?.allowanceRate != null && (
              <Text style={styles.rateText}>
                Your rate: ${Number(user.allowanceRate).toFixed(2)}/hr
              </Text>
            )}

            {statsExpanded && (
              <View style={styles.expandedStats}>
                <Divider style={styles.statsDivider} />
                <Text variant="labelLarge" style={styles.historyTitle}>Allowance Earned</Text>

                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>This Week</Text>
                  <Text style={styles.historyValue}>
                    ${getAllowanceEarned(7)}
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>This Month</Text>
                  <Text style={styles.historyValue}>
                    ${getAllowanceEarned(30)}
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>All Time</Text>
                  <Text style={styles.historyValue}>
                    ${childBalance?.totalEarned != null ? Number(childBalance.totalEarned).toFixed(2) : '0.00'}
                  </Text>
                </View>

                <Divider style={styles.statsDivider} />
                <Text variant="labelLarge" style={styles.historyTitle}>Screen Time Earned</Text>

                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>This Week</Text>
                  <Text style={styles.historyValue}>
                    {getMinutesEarned(7)} min
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>This Month</Text>
                  <Text style={styles.historyValue}>
                    {getMinutesEarned(30)} min
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>All Time</Text>
                  <Text style={styles.historyValue}>
                    {getMinutesEarned(null)} min
                  </Text>
                </View>

                <Divider style={styles.statsDivider} />
                <Text variant="labelLarge" style={styles.historyTitle}>Screen Time Used</Text>

                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>This Week</Text>
                  <Text style={styles.historyValue}>
                    {getMinutesUsed(7)} min
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>This Month</Text>
                  <Text style={styles.historyValue}>
                    {getMinutesUsed(30)} min
                  </Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>All Time</Text>
                  <Text style={styles.historyValue}>
                    {getMinutesUsed(null)} min
                  </Text>
                </View>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Recent Activity */}
        <Card style={styles.card} mode="elevated">
          <Card.Title
            title="Recent Activity"
            titleVariant="titleMedium"
            left={(props) => (
              <Avatar.Icon
                {...props}
                icon="history"
                size={40}
                style={styles.sectionIcon}
              />
            )}
          />
          <Card.Content>
            {completions.length === 0 ? (
              <Text style={styles.emptyText}>No completed chores yet. Start earning!</Text>
            ) : (
              completions.map((item, index) => {
                const choreName = item.choreId?.name || item.chore?.name || 'Chore';
                const status = item.status;
                const statusIcon = status === 'approved' ? 'check-circle' : status === 'rejected' ? 'close-circle' : 'clock-outline';
                const statusColor = status === 'approved' ? '#4caf50' : status === 'rejected' ? '#d32f2f' : '#ff9800';

                return (
                  <View key={item._id || item.id || index}>
                    {index > 0 && <Divider style={styles.divider} />}
                    <View style={styles.activityRow}>
                      <Avatar.Icon icon={statusIcon} size={32} style={{ backgroundColor: statusColor }} />
                      <View style={styles.activityText}>
                        <Text variant="bodyMedium" style={styles.activityName}>{choreName}</Text>
                        <Text variant="bodySmall" style={styles.activityStatus}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                          {item.completedAt && ` · ${new Date(item.completedAt).toLocaleDateString()}`}
                        </Text>
                      </View>
                      {status === 'approved' && item.choreId?.screenTimeMinutes > 0 && (
                        <Text style={styles.activityReward}>+{item.choreId.screenTimeMinutes}min</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={3000}
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#ede7f6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  statValue: {
    color: '#6200ee',
    fontWeight: 'bold',
  },
  balanceValue: {
    color: '#2e7d32',
    fontWeight: 'bold',
  },
  savingsValue: {
    color: '#2e7d32',
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
  expandedStats: {
    marginTop: 8,
  },
  statsDivider: {
    marginVertical: 12,
  },
  historyTitle: {
    color: '#6200ee',
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  historyLabel: {
    color: '#666',
    fontSize: 14,
  },
  historyValue: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    paddingVertical: 16,
  },
  divider: {
    marginVertical: 8,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  activityText: {
    flex: 1,
  },
  activityName: {
    fontWeight: '600',
  },
  activityStatus: {
    color: '#888',
  },
  activityReward: {
    color: '#6200ee',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
