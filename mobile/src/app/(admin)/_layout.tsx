import { Stack } from 'expo-router'

export default function AdminLayout() {
  return (
    <Stack initialRouteName="home">
      <Stack.Screen name="home" options={{ title: 'Painel' }} />
    </Stack>
  )
}
