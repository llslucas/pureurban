import { Stack } from 'expo-router'

import { useAppHeaderOptions } from '@/lib/app-header'

// No AccountMenu: the panel's only action is "Sair", already on the screen.
export default function AdminLayout() {
  const headerOptions = useAppHeaderOptions()
  return (
    <Stack initialRouteName="home" screenOptions={headerOptions}>
      <Stack.Screen name="home" options={{ title: 'Painel' }} />
    </Stack>
  )
}
