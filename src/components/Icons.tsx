import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Port of the web's src/components/Icons.tsx: the same 24px paths, 2.2px round strokes. Icons are decorative,
// so screen readers skip them; the control around each icon carries the label.
type IconProps = { size?: number; color: string };

function Icon({ size = 18, color, filled = false, children }: IconProps & { filled?: boolean; children: ReactNode }) {
  // Hidden from screen readers on a wrapping View: Svg would pass the prop straight to the DOM on web.
  // aria-hidden covers iOS, Android and web in one prop.
  return (
    <View aria-hidden>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={filled ? 'none' : color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
    </View>
  );
}

export const Bolt = (p: IconProps) => (
  <Icon {...p} filled>
    <Path d="M13.5 2 4.5 13.5H11L10 22l9-11.5h-6.5L13.5 2z" />
  </Icon>
);

export const Warn = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3.5 2.5 20h19L12 3.5z" />
    <Path d="M12 10v4.5M12 17.5h.01" />
  </Icon>
);
