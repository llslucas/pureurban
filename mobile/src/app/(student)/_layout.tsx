import { Stack } from 'expo-router';

import { AccountMenu } from '@/components/account-menu';
import { useAppHeaderOptions } from '@/lib/app-header';

export default function StudentLayout() {
  const headerOptions = useAppHeaderOptions();
  return (
    <Stack
      initialRouteName="home"
      screenOptions={{ ...headerOptions, headerRight: () => <AccountMenu /> }}
    >
      <Stack.Screen name="home" options={{ title: 'Início' }} />
      <Stack.Screen name="qr-code" options={{ title: 'Meu QR Code' }} />
      <Stack.Screen name="track-bus" options={{ title: 'Acompanhar ônibus' }} />
    </Stack>
  );
}
