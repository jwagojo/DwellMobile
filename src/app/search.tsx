import { Redirect, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import CarPicker from '@/components/CarPicker';
import DestinationSearch from '@/components/DestinationSearch';
import Header from '@/components/Header';
import ListingCard from '@/components/ListingCard';
import SearchMap from '@/components/map/SearchMap';
import NearMeButton from '@/components/NearMeButton';
import SelectField from '@/components/SelectField';
import { InfoNote, Screen, Segmented } from '@/components/ui';
import { DEFAULT_DESTINATION, placeName } from '@/shared/data/destinations';
import { SEARCH_RADIUS_M, evaluateListing, sortEvaluations, type Evaluation, type SortMode } from '@/shared/features/search/evaluateListing';
import { startHasPassed } from '@/shared/features/session/bookingGuard';
import { todayIndex } from '@/shared/lib/availability';
import { fmtHour, fmtRange } from '@/shared/lib/format';
import { boundsAround, boundsContain, type GeoBounds } from '@/shared/lib/geo';
import { SIGNUP_PATH } from '@/shared/lib/hostEntry';
import { useApp, type LevelFilter } from '@/state/AppState';
import { colors, fonts, radius, space, text } from '@/theme';

/**
 * Port of the web's src/pages/Search.tsx. Same filters, same results (the listings inside the map's view), same
 * notes. On a phone the controls, the map and the list stack in one scrolling screen.
 */

const START_HOURS = Array.from({ length: 24 }, (_, h) => h);
const DURATIONS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Where an empty search box starts the map. Moving the map overrides it. */
const BROWSE_CENTER = { lat: DEFAULT_DESTINATION.lat, lng: DEFAULT_DESTINATION.lng };

export default function Search() {
  const { user, cars, activeCar, destination, startHour, hours, level, sort, listings, update } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // What the map shows right now. Chargers inside it are the results, whether or not there is a destination.
  const [area, setArea] = useState<GeoBounds>(() => boundsAround(destination ?? BROWSE_CENTER, SEARCH_RADIUS_M));

  // The box may be empty: then the driver is browsing the map and no destination is set.
  const [toText, setToText] = useState(destination?.label ?? '');
  // Keep the box in sync when the destination changes elsewhere (landing, host home).
  useEffect(() => setToText(destination?.label ?? ''), [destination?.id, destination?.label]);
  const dayIndex = todayIndex();

  const { shown, hiddenByPlug, notOpen } = useMemo(() => {
    const win = { startHour, hours, dayIndex };
    const evaluated = listings
      .filter((l) => boundsContain(area, l))
      .filter((l) => level === 'any' || l.level === level)
      .map((l) => evaluateListing(l, activeCar, destination, win))
      .filter((e): e is Evaluation => e !== null);
    return {
      hiddenByPlug: evaluated.filter((e) => !e.plugOk).length,
      notOpen: evaluated.filter((e) => e.plugOk && !e.open).length,
      shown: sortEvaluations(
        evaluated.filter((e) => e.plugOk && e.open),
        sort,
      ),
    };
  }, [listings, area, destination, level, activeCar, startHour, hours, dayIndex, sort]);

  if (!user) return <Redirect href={SIGNUP_PATH as Href} />;

  const nowHour = new Date().getHours();
  const startPassed = startHasPassed(startHour, Date.now());
  const effectiveSelected = shown.some((e) => e.listing.id === selectedId) ? selectedId : (shown[0]?.listing.id ?? null);

  return (
    <Screen header={<Header />} padded={false}>
      <View style={styles.controls}>
        <DestinationSearch
          label="To"
          value={toText}
          onInputChange={(t) => {
            setToText(t);
            // Emptying the box clears the destination. The map stays where it is and keeps listing what it shows.
            if (!t.trim() && destination) update({ destination: null });
          }}
          onSelect={(d) => {
            setToText(d.label);
            update({ destination: d });
          }}
          // Leaving the box without choosing a suggestion puts the current destination back (or leaves it empty).
          onBlur={() => setToText(destination?.label ?? '')}
        />
        <NearMeButton
          label="Near me"
          onLocated={(d) => {
            setToText(d.label);
            update({ destination: d });
          }}
        />

        <View style={styles.when} accessibilityLabel="When">
          <Text style={styles.whenLabel}>When</Text>
          <View style={styles.whenBox}>
            <Text style={styles.whenText}>Today from</Text>
            <SelectField
              compact
              label="Start time"
              value={startHour}
              options={START_HOURS.map((h) => ({ value: h, label: fmtHour(h), disabled: h < nowHour }))}
              onChange={(h) => update({ startHour: h })}
            />
            <Text style={styles.whenText}>for</Text>
            <SelectField compact label="Duration in hours" value={hours} options={DURATIONS.map((h) => ({ value: h, label: `${h} h` }))} onChange={(h) => update({ hours: h })} />
          </View>
        </View>

        <CarPicker cars={cars} value={activeCar} onChange={(next) => update({ car: next })} />

        <Segmented<LevelFilter>
          label="Level"
          value={level}
          onChange={(v) => update({ level: v })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'L2', label: 'L2' },
            { value: 'L1', label: 'L1' },
          ]}
        />
      </View>

      <View style={styles.map}>
        <SearchMap
          destination={destination}
          browseCenter={BROWSE_CENTER}
          onAreaChange={setArea}
          pins={shown.map((e) => ({ id: e.listing.id, lat: e.listing.lat, lng: e.listing.lng, price: e.pricePerHr, title: e.listing.title }))}
          selectedId={effectiveSelected}
          onSelect={setSelectedId}
        />
      </View>

      <View style={styles.results} accessibilityLabel="Chargers">
        <View style={styles.resultsHead}>
          <Text style={styles.h1} accessibilityRole="header">
            {destination ? `Chargers near ${placeName(destination)}` : 'Chargers on the map'}
          </Text>
          <Text style={styles.count}>
            {shown.length} charger{shown.length === 1 ? '' : 's'}, {fmtRange(startHour, hours)}. Prices for your {activeCar.name}.
          </Text>
          <Text style={styles.small}>
            {destination
              ? 'Miles shown are estimated miles added. Walk times are estimates.'
              : 'Miles shown are estimated miles added. Drag the map to search another area, or add a destination to see walks, routes and Green Scores.'}
          </Text>
        </View>
        <Segmented<SortMode>
          label="Sort"
          value={sort}
          onChange={(v) => update({ sort: v })}
          options={[
            { value: 'fit', label: 'Best fit' },
            { value: 'price', label: 'Lowest price' },
          ]}
        />

        {startPassed ? <InfoNote>{fmtHour(startHour)} has already passed today. Pick a later start to book.</InfoNote> : null}
        {hiddenByPlug > 0 ? (
          <InfoNote>
            {hiddenByPlug === 1
              ? `1 listing is hidden: the plug doesn’t fit your ${activeCar.name} and the host has no adapter.`
              : `${hiddenByPlug} listings are hidden: the plug doesn’t fit your ${activeCar.name} and those hosts have no adapter.`}
          </InfoNote>
        ) : null}
        {notOpen > 0 ? <InfoNote>{notOpen === 1 ? '1 more isn’t open for this whole time window.' : `${notOpen} more aren’t open for this whole time window.`}</InfoNote> : null}

        {shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {destination ? `No chargers near ${placeName(destination)} for this filter yet.` : 'No chargers in this part of the map for this filter. Drag the map or zoom out to look elsewhere.'}
            </Text>
          </View>
        ) : (
          shown.map((ev) => (
            <ListingCard
              key={ev.listing.id}
              ev={ev}
              car={activeCar}
              destination={destination}
              selected={ev.listing.id === effectiveSelected}
              onSelect={() => setSelectedId(ev.listing.id)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, backgroundColor: colors.paper, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  when: { gap: 6 },
  whenLabel: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },
  whenBox: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.card, backgroundColor: colors.paper, paddingHorizontal: 14 },
  whenText: { fontFamily: fonts.bodyMedium, fontSize: text.md, color: colors.ink },
  map: { height: 340, backgroundColor: colors.mapLand },
  results: { gap: space.md, paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.xxl },
  resultsHead: { gap: 4 },
  h1: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  count: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.muted },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  empty: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: space.lg },
  emptyText: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 24, color: colors.body },
});
