import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Car } from '@/shared/types/listing';
import { space } from '@/theme';
import SelectField from './SelectField';

/**
 * Port of the web's CarPicker.tsx: Make → Model → Version over the car list (Open EV Data from the API, or the 8
 * seeded cars). Each version carries its own AC speed, so the price follows the exact trim the driver picks. The
 * driver is never asked about adapters: hosts provide them.
 */

export const makeOf = (c: Car) => c.make ?? c.name.split(' ')[0];
export const modelOf = (c: Car) => c.model ?? c.name.split(' ').slice(1).join(' ');
const kw = (c: Car) => (c.maxAcKw === null ? 'speed unknown' : `${c.maxAcKw} kW`);
export const versionLabel = (c: Car) => [c.year ?? (c.make ? '' : 'Any year'), c.version, `· ${kw(c)}`].filter(Boolean).join(' ');

/** Newest year first, then by version name. */
const newestFirst = (a: Car, b: Car) => (b.year ?? 0) - (a.year ?? 0) || (a.version ?? '').localeCompare(b.version ?? '');

export default function CarPicker({ cars, value, onChange }: { cars: Car[]; value: Car; onChange: (car: Car) => void }) {
  // A saved car that is not in the list (chosen before the list changed) stays selectable.
  const all = useMemo(() => (cars.some((c) => c.id === value.id) ? cars : [value, ...cars]), [cars, value]);
  const current = all.find((c) => c.id === value.id) ?? value;
  const make = makeOf(current);
  const model = modelOf(current);

  const makes = useMemo(() => [...new Set(all.map(makeOf))].sort((a, b) => a.localeCompare(b)), [all]);
  const models = useMemo(() => [...new Set(all.filter((c) => makeOf(c) === make).map(modelOf))].sort((a, b) => a.localeCompare(b)), [all, make]);
  const versions = useMemo(() => all.filter((c) => makeOf(c) === make && modelOf(c) === model).sort(newestFirst), [all, make, model]);

  /** Picking a make or model jumps to its newest version, so the price always has a car behind it. */
  const firstOf = (m: string, md?: string) => all.filter((c) => makeOf(c) === m && (md === undefined || modelOf(c) === md)).sort((a, b) => modelOf(a).localeCompare(modelOf(b)) || newestFirst(a, b))[0];

  return (
    <View style={styles.wrap} accessibilityLabel="Your car">
      <View style={styles.row}>
        <View style={styles.half}>
          <SelectField
            label="Car make"
            value={make}
            options={makes.map((m) => ({ value: m, label: m }))}
            onChange={(m) => {
              const next = firstOf(m);
              if (next) onChange(next);
            }}
          />
        </View>
        <View style={styles.half}>
          <SelectField
            label="Model"
            value={model}
            options={models.map((m) => ({ value: m, label: m }))}
            onChange={(m) => {
              const next = firstOf(make, m);
              if (next) onChange(next);
            }}
          />
        </View>
      </View>
      <SelectField
        label="Year and trim"
        value={current.id}
        options={versions.map((c) => ({ value: c.id, label: versionLabel(c) }))}
        onChange={(id) => {
          const next = versions.find((c) => c.id === id);
          if (next) onChange(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
});
