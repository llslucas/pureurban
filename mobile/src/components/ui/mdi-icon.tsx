import { MaterialCommunityIcons } from '@expo/vector-icons'
import React, { type ComponentProps } from 'react'

export type MdiIconName = ComponentProps<typeof MaterialCommunityIcons>['name']

interface MdiIconProps {
  name: MdiIconName
  size: number
  color: string
  testID?: string
}

// Every icon in ui/ sits next to a text that already carries the meaning, so it
// stays out of the accessibility tree instead of being read as a stray glyph.
// react-native-web ignores the two native props, hence `aria-hidden` as well.
export function MdiIcon({ name, size, color, testID }: MdiIconProps) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}
