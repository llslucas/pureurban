import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper'

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#208AEF', // Azul PureUrban (da splash screen)
    secondary: '#E6F4FE', // Azul claro (do adaptive icon background)
  },
}

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#208AEF',
    secondary: '#1a3a54',
  },
}
