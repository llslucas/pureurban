import { Stack } from 'expo-router'

export default function DriverLayout() {
  return (
    <Stack initialRouteName="trip">
      <Stack.Screen name="trip" options={{ title: 'Viagem' }} />
      <Stack.Screen name="scan" options={{ title: 'Escanear QR Code' }} />
      <Stack.Screen name="student-list" options={{ title: 'Alunos da viagem' }} />
      <Stack.Screen name="routes" options={{ title: 'Minhas rotas' }} />
    </Stack>
  )
}
