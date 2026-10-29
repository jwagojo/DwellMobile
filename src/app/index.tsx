import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WalkChip } from '@/components/badges';
import BookingBanner from '@/components/BookingBanner';
import DestinationSearch from '@/components/DestinationSearch';
import Header from '@/components/Header';
import { Search } from '@/components/Icons';
import MapPreview from '@/components/map/MapPreview';
import NearMeButton from '@/components/NearMeButton';
import { Button, Screen, TextLink } from '@/components/ui';
import { stationIdToDestination, stationToDestination } from '@/shared/data/destinations';
import { DEFAULT_CAR } from '@/shared/data/evFallbackSeed';
import { HERO_FEATURED_ID, HERO_PREVIEW_LISTINGS } from '@/shared/data/heroPreview';
import { POPULAR_STATION_IDS, findStation, stationById } from '@/shared/data/stations';
import { LINE_STYLES } from '@/shared/data/transit';
import { evaluateListing } from '@/shared/features/search/evaluateListing';
import { todayIndex } from '@/shared/lib/availability';
import { hostEntryPath, SIGNIN_PATH } from '@/shared/lib/hostEntry';
import type { Destination } from '@/shared/types/destination';
import { useApp } from '@/state/AppState';
import { colors, displayTracking, fonts, radius, space, text } from '@/theme';

/** Port of the web's src/pages/Landing.tsx, stacked for a phone. Same copy, same engine-priced preview. */

const STEPS = [
  { title: 'Book', body: 'Pick a charger near your stop. The price is set for your car, so you only pay for the power it can take.' },
  { title: 'Park', body: 'Park in the host’s spot and take an arrival photo. No key handoff, the car never moves, and the host never touches it.' },
  { title: 'Charge', body: 'Set your charge limit in your car’s app and plug in. Then head to the T.' },
  { title: 'Go', body: 'Come back, tap Pick up, and take a photo. Your session ends when you do.' },
];

const VALUE_PROPS = [
  { title: 'Priced for your car', body: 'A car can only draw so much power. Your price uses the lower of the charger’s speed and your car’s, so a Prius Prime doesn’t pay for a Model Y’s appetite.' },
  { title: 'See the whole trip', body: 'Every listing shows the walk to the station and the routes you can ride from there, next to the price.' },
  { title: 'Green Score, shown as a formula', body: 'Solar share, transit miles and CO₂ avoided, each with its weight. Open any listing to check the math.' },
];

const CHIP_LABEL: Record<string, string> = { central: 'Central', harvard: 'Harvard', kendall: 'Kendall/MIT', porter: 'Porter', alewife: 'Alewife' };

// Four illustrative listings near Central Square (data/heroPreview.ts); the featured one is highlighted.
const HERO_WINDOW = { startHour: 10, hours: 4 };

/** The hero's visual: the map of four sample listings near Central and the same four as a priced ledger. */
function HeroLedger() {
  const central = stationById('central');
  const evs = useMemo(() => {
    const win = { ...HERO_WINDOW, dayIndex: todayIndex() };
    return HERO_PREVIEW_LISTINGS.map((l) => evaluateListing(l, DEFAULT_CAR, central, win)).filter((e): e is NonNullable<typeof e> => e !== null);
  }, [central]);

  return (
    <View style={styles.ledger}>
      <View style={styles.preview}>
        <MapPreview
          center={{ lat: 42.358, lng: -71.111 }}
          zoom={13}
          pins={evs.map((e) => ({ id: e.listing.id, lat: e.listing.lat, lng: e.listing.lng, price: e.pricePerHr, selected: e.listing.id === HERO_FEATURED_ID }))}
        />
      </View>
      <View>
        {evs.map((e) => {
          const featured = e.listing.id === HERO_FEATURED_ID;
          return (
            <View key={e.listing.id} style={[styles.ledgerRow, featured && { backgroundColor: colors.brandWash }]}>
              <View style={styles.ledgerMain}>
                <Text style={[styles.ledgerTitle, featured && { fontFamily: fonts.bodySemibold }]}>{e.listing.title}</Text>
                <View style={styles.ledgerMeta}>
                  {e.walkMinutes !== null ? <WalkChip minutes={e.walkMinutes} /> : null}
                  <Text style={styles.ledgerSmall}>+{Math.round(e.milesAdded)} mi</Text>
                  <Text style={[styles.ledgerSmall, { color: colors.greenInk }]}>Green {e.greenScore !== null ? e.greenScore.toFixed(2) : 'n/a'}</Text>
                </View>
              </View>
              <Text style={styles.ledgerPrice}>
                ${e.pricePerHr.toFixed(2)}
                <Text style={styles.ledgerUnit}>/hr</Text>
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.caption}>Sample listings near Central (Red Line), priced for a {DEFAULT_CAR.name} from 10 am for 4 hours. Miles are estimated miles added.</Text>
    </View>
  );
}

export default function Landing() {
  const { user, hostListing, update } = useApp();
  const [textValue, setTextValue] = useState('');
  const [picked, setPicked] = useState<Destination | null>(null);
  const [error, setError] = useState('');

  function goTo(destination: Destination) {
    setError('');
    update({ destination });
    // The destination is saved in app state, so it is still there after sign-in, which continues to search.
    router.navigate((user ? '/search' : SIGNIN_PATH) as Href);
  }

  function onSubmit() {
    // A suggestion the visitor picked, or typed text that exactly names a station.
    const station = findStation(textValue);
    const destination = picked ?? (station ? stationToDestination(station) : null);
    if (!destination) return setError('Choose a station or an address from the suggestions.');
    goTo(destination);
  }

  const hostPath = hostEntryPath(user !== null, hostListing !== null) as Href;

  return (
    <Screen header={<Header />} padded={false}>
      <BookingBanner />
      <View style={styles.hero}>
        <Text style={styles.display} accessibilityRole="header">
          Park at a neighbor’s charger. Ride the rest of the way.
        </Text>
        <Text style={styles.lead}>Book a home EV charger near Central, Harvard or Kendall. Plug in, walk away, and come back to more miles.</Text>

        <View style={styles.search}>
          <DestinationSearch
            label="Where are you headed?"
            value={textValue}
            error={error || undefined}
            onInputChange={(t) => {
              setTextValue(t);
              setPicked(null);
              setError('');
            }}
            onSelect={(d) => {
              setTextValue(d.label);
              setPicked(d);
              setError('');
            }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Find chargers" onPress={onSubmit} style={({ pressed }) => [styles.find, pressed && { backgroundColor: colors.greenDeep }]}>
            <Search size={20} color={colors.onInk} />
            <Text style={styles.findText}>Find chargers</Text>
          </Pressable>
        </View>

        <NearMeButton onLocated={goTo} />

        <View style={styles.chips}>
          <Text style={styles.chipsLabel}>Popular:</Text>
          {POPULAR_STATION_IDS.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${CHIP_LABEL[id] ?? stationById(id).name} station`}
              onPress={() => goTo(stationIdToDestination(id))}
              style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.brandTint, borderColor: colors.brand }]}
            >
              <View style={[styles.dot, { backgroundColor: LINE_STYLES.red.stroke }]} />
              <Text style={styles.chipText}>{CHIP_LABEL[id] ?? stationById(id).name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.body}>
          Have a charger? <TextLink label="List it and earn from idle hours" onPress={() => router.navigate(hostPath)} />
        </Text>

        <HeroLedger />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Book, park, charge, go.
        </Text>
        <Text style={styles.lead}>Four steps, and you never meet the host or hand over a key.</Text>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <Text style={styles.stepNum} aria-hidden>
              {i + 1}
            </Text>
            <Text style={styles.stepTitle}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        {VALUE_PROPS.map((v, i) => (
          <View key={v.title} style={[styles.value, i < VALUE_PROPS.length - 1 && styles.valueRule]}>
            <Text style={styles.valueTitle} accessibilityRole="header">
              {v.title}
            </Text>
            <Text style={styles.valueBody}>{v.body}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: colors.ink }]}>
        <Text style={[styles.sectionTitle, { color: colors.onInk }]} accessibilityRole="header">
          Your charger sits idle all day. List it.
        </Text>
        <Text style={[styles.lead, { color: colors.onInkMuted }]}>Set your own hourly earnings. The price is built to cover the most electricity the booked car can draw.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Become a host" onPress={() => router.navigate(hostPath)} style={({ pressed }) => [styles.hostBtn, pressed && { backgroundColor: colors.paper3 }]}>
          <Text style={styles.hostBtnText}>Become a host</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerMark}>Dwell</Text>
        <Text style={styles.footerNote}>Hackachusetts 2026, Climate/Energy track</Text>
        <Text style={styles.footerNote}>Payments and notifications are simulated in this demo. Listings, routes and sunlight are sample data.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.md, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg, backgroundColor: colors.paper, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  display: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, letterSpacing: displayTracking(36), color: colors.ink },
  lead: { fontFamily: fonts.body, fontSize: text.lead, lineHeight: 27, color: colors.ink2 },
  body: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 25, color: colors.body },
  search: { gap: space.xs },
  find: { height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  findText: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.onInk },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chipsLabel: { fontFamily: fonts.body, fontSize: text.sm, color: colors.muted },
  chip: { height: 40, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, paddingHorizontal: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },

  ledger: { gap: space.md },
  preview: { height: 260, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  ledgerMain: { flex: 1, gap: 4 },
  ledgerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  ledgerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  ledgerSmall: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.body },
  ledgerPrice: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.ink },
  ledgerUnit: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },

  section: { paddingHorizontal: space.md, paddingVertical: space.xxl, gap: space.md, backgroundColor: colors.paper },
  sectionTitle: { fontFamily: fonts.display, fontSize: text.section, lineHeight: 36, letterSpacing: displayTracking(text.section), color: colors.ink },
  step: { gap: space.xs, borderTopWidth: 1, borderTopColor: colors.lineStrong, paddingTop: space.lg, marginTop: space.sm },
  // Lining numerals, like the web: Vollkorn's default old-style "1" reads as an "I".
  stepNum: { fontFamily: fonts.display, fontSize: 64, lineHeight: 64, color: colors.brand, fontVariant: ['lining-nums'] },
  stepTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  value: { gap: space.sm, paddingVertical: space.lg },
  valueRule: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  valueTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  valueBody: { fontFamily: fonts.body, fontSize: text.lead, lineHeight: 28, color: colors.body },
  hostBtn: { height: 52, borderRadius: radius.pill, backgroundColor: colors.accent2, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  hostBtnText: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
  footer: { paddingHorizontal: space.md, paddingVertical: space.xxl, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, backgroundColor: colors.paper },
  footerMark: { fontFamily: fonts.display, fontSize: 48, color: colors.ink },
  footerNote: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.muted },
});
