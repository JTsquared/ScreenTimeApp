import { useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { Icon, IconButton, Dialog, Portal, Button, Text } from 'react-native-paper';

export default function TabLayout() {
  const { isParent, user, logout } = useAuth();
  const parentMode = isParent();
  const router = useRouter();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const handleLogout = async () => {
    setLogoutVisible(false);
    await logout();
    router.replace('/');
  };

  const LogoutButton = () => (
    <IconButton
      icon="account-circle"
      iconColor="#ffffff"
      size={28}
      onPress={() => setLogoutVisible(true)}
      style={{ marginRight: 4, opacity: 1 }}
    />
  );

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#6200ee',
          tabBarInactiveTintColor: '#888',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: '#e0e0e0',
            paddingBottom: 4,
            paddingTop: 4,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: '#6200ee',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerRight: () => <LogoutButton />,
        }}
      >
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Icon source="home" size={size} color={color} />
            ),
            href: parentMode ? null : '/profile',
          }}
        />
        <Tabs.Screen
          name="chores"
          options={{
            title: 'Chores',
            tabBarIcon: ({ color, size }) => (
              <Icon source="clipboard-check-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="approvals"
          options={{
            title: 'Approvals',
            tabBarIcon: ({ color, size }) => (
              <Icon source="check-decagram" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="devices"
          options={{
            title: 'Devices',
            tabBarIcon: ({ color, size }) => (
              <Icon source="devices" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: 'Wallet',
            tabBarIcon: ({ color, size }) => (
              <Icon source="wallet" size={size} color={color} />
            ),
            href: parentMode ? null : '/wallet',
          }}
        />
        <Tabs.Screen
          name="payouts"
          options={{
            title: 'Payouts',
            tabBarIcon: ({ color, size }) => (
              <Icon source="cash-multiple" size={size} color={color} />
            ),
            href: parentMode ? '/payouts' : null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Icon source="cog" size={size} color={color} />
            ),
            href: parentMode ? '/settings' : null,
          }}
        />
      </Tabs>

      <Portal>
        <Dialog visible={logoutVisible} onDismiss={() => setLogoutVisible(false)}>
          <Dialog.Title>Sign Out</Dialog.Title>
          <Dialog.Content>
            <Text>Signed in as {user?.name || 'User'}. Do you want to sign out?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutVisible(false)}>Cancel</Button>
            <Button onPress={handleLogout} textColor="#d32f2f">Sign Out</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
