import { focusManager } from '@tanstack/react-query'
import { AppState, Platform, type AppStateStatus } from 'react-native'

// React Native has no window focus: without this bridge TanStack never learns
// the app went to background (refetchInterval keeps firing) nor that it came
// back (no refetchOnWindowFocus). On web the default visibilitychange listener
// already does the job.
export function setupAppFocus(): () => void {
  if (Platform.OS === 'web') return () => {}

  const subscription = AppState.addEventListener(
    'change',
    (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active')
    },
  )
  return () => subscription.remove()
}
