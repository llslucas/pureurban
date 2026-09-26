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
export function MdiIcon({ name, size, color, testID }: MdiIconProps) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}
