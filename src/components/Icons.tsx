import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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

export const Search = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="m20.5 20.5-4.6-4.6" />
  </Icon>
);

export const Walk = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="13" cy="4.5" r="1.8" />
    <Path d="m9.5 21 2.7-6.5L15 17v4" />
    <Path d="m7 12 3.3-3.7 3.4 1.2 1.8 3 3 1" />
  </Icon>
);

export const Sun = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </Icon>
);

export const Plug = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 2.5v5M15 2.5v5M6 7.5h12V11a6 6 0 0 1-12 0V7.5zM12 17v4.5" />
  </Icon>
);

export const Warn = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3.5 2.5 20h19L12 3.5z" />
    <Path d="M12 10v4.5M12 17.5h.01" />
  </Icon>
);

export const Info = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 11v5M12 8h.01" />
  </Icon>
);

export const Camera = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3.5 8h3.2L8.5 5h7l1.8 3h3.2v11h-17V8z" />
    <Circle cx="12" cy="13.2" r="3.5" />
  </Icon>
);

export const Pin = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 21.5s7-6.2 7-11.8a7 7 0 0 0-14 0c0 5.6 7 11.8 7 11.8z" />
    <Circle cx="12" cy="9.7" r="2.4" />
  </Icon>
);

export const Locate = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3.2" />
    <Circle cx="12" cy="12" r="7.5" />
    <Path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
  </Icon>
);

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m15 5-7 7 7 7" />
  </Icon>
);

/** Mobile addition: the "open a list" marker on select fields. */
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m6 9 6 6 6-6" />
  </Icon>
);

export const House = (p: IconProps) => (
  <Icon {...p}>
    <Path d="m3 11 9-8 9 8" />
    <Path d="M5.5 9.5V20h13V9.5" />
  </Icon>
);
