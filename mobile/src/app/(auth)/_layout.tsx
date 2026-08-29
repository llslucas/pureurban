import { Stack } from 'expo-router';

// `headerShown: false` explícito: o `screenOptions` do layout raiz cobre só as
// telas do navegador raiz, não as de um navegador aninhado. Sem isto o login
// — única tela do grupo, e a primeira que o app mostra — ganha o header default
// do native-stack, intitulado com o nome da rota ("login").
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
