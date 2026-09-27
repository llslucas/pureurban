import { Stack } from 'expo-router'

import { appHeaderOptions } from '@/lib/app-header'

// No AccountMenu: the panel's only action is "Sair", already on the screen.
export default function AdminLayout() {
  return (
    <Stack initialRouteName="home" screenOptions={appHeaderOptions}>
      <Stack.Screen name="home" options={{ title: 'Painel' }} />
    </Stack>
  )
}
