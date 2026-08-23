import { Stack } from 'expo-router';

export default function StudentLayout() {
  return (
    <Stack initialRouteName="home">
      <Stack.Screen name="home" options={{ title: 'Início' }} />
      <Stack.Screen name="qr-code" options={{ title: 'Meu QR Code' }} />
      <Stack.Screen name="track-bus" options={{ title: 'Acompanhar ônibus' }} />
    </Stack>
  );
}
