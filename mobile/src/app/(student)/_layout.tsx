import { Stack } from 'expo-router';

import { AccountMenu } from '@/components/account-menu';
import { appHeaderOptions } from '@/lib/app-header';

export default function StudentLayout() {
  return (
    <Stack
      initialRouteName="home"
      screenOptions={{ ...appHeaderOptions, headerRight: () => <AccountMenu /> }}
    >
      <Stack.Screen name="home" options={{ title: 'Início' }} />
      <Stack.Screen name="qr-code" options={{ title: 'Meu QR Code' }} />
      <Stack.Screen name="track-bus" options={{ title: 'Acompanhar ônibus' }} />
    </Stack>
  );
}
