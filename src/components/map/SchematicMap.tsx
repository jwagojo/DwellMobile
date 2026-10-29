import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { STATIONS } from '@/shared/data/stations';
import { LINE_STYLES } from '@/shared/data/transit';
import type { LatLng } from '@/shared/lib/geo';
import { colors } from '@/theme';

/* Port of the web's map/SchematicMap.tsx. Geometry is hand-drawn from approximate coordinates and is NOT
   survey-accurate. It is only the labeled fallback shown when the live map can't run (Expo Go, web preview). */

const M_PER_DEG_LAT = 111_195;
const VISIBLE_METERS_TALL = 4500;

type Pt = [number, number]; // [lat, lng]

const RIVER: Pt[] = [[42.366, -71.14], [42.3665, -71.125], [42.3655, -71.117], [42.36, -71.113], [42.354, -71.109], [42.351, -71.106], [42.351, -71.1], [42.3535, -71.093], [42.3555, -71.089], [42.3585, -71.083], [42.36, -71.076], [42.362, -71.07], [42.3665, -71.065]];
const RED: Pt[] = [[42.3954, -71.1425], [42.3967, -71.122], [42.3884, -71.1191], [42.3734, -71.119], [42.3654, -71.1031], [42.3624, -71.0862], [42.3612, -71.0706], [42.3564, -71.0624], [42.3523, -71.0552], [42.321, -71.0524]];
const ORANGE: Pt[] = [[42.3664, -71.062], [42.3564, -71.0624], [42.3473, -71.0752], [42.3005, -71.1137]];
const GREEN: Pt[] = [[42.3664, -71.062], [42.3564, -71.0624], [42.3473, -71.0752]];
const COMMUTER: Pt[] = [[42.3664, -71.062], [42.379, -71.085], [42.3884, -71.1191], [42.382, -71.15]];
const MASS_AVE: Pt[] = [[42.3734, -71.119], [42.3654, -71.1031], [42.3601, -71.0942], [42.3547, -71.0905]];
const PARKS: { c: Pt; rx: number; ry: number }[] = [
  { c: [42.3775, -71.12], rx: 26, ry: 18 },
  { c: [42.355, -71.0655], rx: 40, ry: 28 },
  { c: [42.36, -71.115], rx: 22, ry: 16 },
];
const PLACES: { name: string; at: Pt }[] = [
  { name: 'Cambridgeport', at: [42.3585, -71.1065] },
  { name: 'East Cambridge', at: [42.3708, -71.0805] },
  { name: 'Back Bay', at: [42.3503, -71.0825] },
  { name: 'Allston', at: [42.3555, -71.135] },
];

export type Project = (p: LatLng) => { x: number; y: number };
/** Mobile addition: screen point back to a coordinate, for tapping the schematic to place a pin. */
export type Unproject = (x: number, y: number) => LatLng;

function makeProject(center: LatLng, w: number, h: number, zoom: number): { project: Project; unproject: Unproject } {
  const pxPerM = (h / VISIBLE_METERS_TALL) * zoom;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  return {
    project: (p) => ({
      x: w / 2 + (p.lng - center.lng) * mPerDegLng * pxPerM,
      y: h / 2 - (p.lat - center.lat) * M_PER_DEG_LAT * pxPerM,
    }),
    unproject: (x, y) => ({
      lng: center.lng + (x - w / 2) / (mPerDegLng * pxPerM),
      lat: center.lat - (y - h / 2) / (M_PER_DEG_LAT * pxPerM),
    }),
  };
}

/** The drawn map with a render-prop for overlays (absolutely positioned). Fills its parent. */
export function SchematicMap({
  center,
  zoom = 1,
  showLabels = true,
  children,
}: {
  center: LatLng;
  zoom?: number;
  showLabels?: boolean;
  children?: (ctx: { project: Project; unproject: Unproject; w: number; h: number }) => ReactNode;
}) {
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });
  const { project, unproject } = makeProject(center, w, h, zoom);
  const pts = (line: Pt[]) =>
    line
      .map(([lat, lng]) => {
        const { x, y } = project({ lat, lng });
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const riverWidth = Math.min(Math.max(40 * zoom, 28), 64);
  const riverPts = RIVER.map(([lat, lng]) => project({ lat, lng }));
  const farBank = riverPts.length
    ? `M ${riverPts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} L ${riverPts[riverPts.length - 1].x} ${h + 2000} L ${riverPts[0].x} ${h + 2000} Z`
    : '';
  const riverLabel = project({ lat: 42.3555, lng: -71.1095 });

  return (
    <View style={styles.fill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {w > 0 && (
        <View style={StyleSheet.absoluteFill} aria-hidden>
          <Svg width={w} height={h}>
            <Path d={farBank} fill={colors.mapFarBank} />
            {PARKS.map((p, i) => {
              const c = project({ lat: p.c[0], lng: p.c[1] });
              return <Ellipse key={i} cx={c.x} cy={c.y} rx={p.rx * zoom} ry={p.ry * zoom} fill={colors.mapParks} />;
            })}
            <Polyline points={pts(RIVER)} fill="none" stroke={colors.mapWater} strokeWidth={riverWidth} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={pts(MASS_AVE)} fill="none" stroke={colors.mapStreets} strokeWidth={7} strokeLinecap="round" />
            <Polyline points={pts(COMMUTER)} fill="none" stroke={LINE_STYLES.cr.stroke} strokeWidth={3} strokeDasharray="7 6" />
            <Polyline points={pts(GREEN)} fill="none" stroke={LINE_STYLES.green.stroke} strokeWidth={4} strokeLinecap="round" />
            <Polyline points={pts(ORANGE)} fill="none" stroke={LINE_STYLES.orange.stroke} strokeWidth={4} strokeLinecap="round" />
            <Polyline points={pts(RED)} fill="none" stroke={LINE_STYLES.red.stroke} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            {showLabels &&
              PLACES.map((p) => {
                const c = project({ lat: p.at[0], lng: p.at[1] });
                return (
                  <SvgText key={p.name} x={c.x} y={c.y} textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.mapPlace}>
                    {p.name}
                  </SvgText>
                );
              })}
            {showLabels && (
              <SvgText x={riverLabel.x} y={riverLabel.y} textAnchor="middle" fontSize={12} fontStyle="italic" fontWeight="600" fill={colors.mapWaterLabel}>
                Charles River
              </SvgText>
            )}
            {STATIONS.map((s) => {
              const c = project(s);
              return (
                <G key={s.id}>
                  <Circle cx={c.x} cy={c.y} r={6} fill={colors.paper} stroke={LINE_STYLES[s.primary].stroke} strokeWidth={3} />
                  {/* The paper-colored halo is drawn first: react-native-svg has no paint-order. */}
                  {showLabels && (
                    <SvgText x={c.x + 11} y={c.y + 4} fontSize={12} fontWeight="700" fill={colors.paper} stroke={colors.paper} strokeWidth={3}>
                      {s.name}
                    </SvgText>
                  )}
                  {showLabels && (
                    <SvgText x={c.x + 11} y={c.y + 4} fontSize={12} fontWeight="700" fill={colors.mapStation}>
                      {s.name}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>
        </View>
      )}
      {w > 0 && children?.({ project, unproject, w, h })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', backgroundColor: colors.mapLand },
});
