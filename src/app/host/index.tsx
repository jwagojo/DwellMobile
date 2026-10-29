import { Redirect, router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Photo, RouteBadges, StatusDot, WalkChip } from '@/components/badges';
import Header from '@/components/Header';
import { Button, Card, Screen, Title, WarnNote } from '@/components/ui';
import { stationToDestination } from '@/shared/data/destinations';
import { EV_MODELS } from '@/shared/data/evFallbackSeed';
import { STATIONS } from '@/shared/data/stations';
import { computePrice } from '@/shared/engines/pricing';
import { summarizeDays } from '@/shared/lib/availability';
import { fmtHour, formatDataMonth, formatRateInput, money } from '@/shared/lib/format';
import { estimateWalk, haversineDistanceMeters } from '@/shared/lib/geo';
import { EDIT_LISTING_PATH, NEW_LISTING_PATH, SIGNUP_FOR_HOSTING_PATH } from '@/shared/lib/hostEntry';
import { useApp } from '@/state/AppState';
import { colors, displayTracking, fonts, radius, space, text } from '@/theme';

/** Port of the web's src/pages/HostHome.tsx: the account's listing as drivers see it, with edit and remove. */

const PRICE_CARS = ['toyota-prius-prime', 'nissan-leaf', 'tesla-my'].map((id) => EV_MODELS.find((c) => c.id === id)!);

export default function HostHome() {
  const { user, hostListing: l, update, backend, syncAccount } = useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  /** Backend: take it out of search on the server (bookings already made can still finish). */
  async function remove() {
    if (!backend) {
      setConfirmRemove(false);
      return update({ hostListing: null });
    }
    setRemoving(true);
    setRemoveError('');
    const r = await backend.api.removeListing();
    if (!r.ok) {
      setRemoving(false);
      return setRemoveError(r.message);
    }
    update({ hostListing: null });
    await syncAccount();
    setRemoving(false);
    setConfirmRemove(false);
  }

  if (!user) return <Redirect href={SIGNUP_FOR_HOSTING_PATH as Href} />;

  if (!l) {
    return (
      <Screen header={<Header />}>
        <Card>
          <Title>No listing yet</Title>
          <Text style={styles.body}>List your charger to start earning from idle hours.</Text>
          <Button label="List your charger" size="lg" block onPress={() => router.navigate(NEW_LISTING_PATH as Href)} />
        </Card>
      </Screen>
    );
  }

  const nearest = STATIONS.map((s) => ({ s, d: haversineDistanceMeters(l, s) })).sort((a, b) => a.d - b.d)[0];
  const walk = estimateWalk(nearest.d);
  const firstName = user.name.trim().split(/\s+/)[0];
  const pa = l.privateAddress;

  return (
    <Screen header={<Header />}>
      <View style={styles.intro}>
        <StatusDot>Live in search</StatusDot>
        <Text style={styles.h1} accessibilityRole="header">
          You’re listed, {firstName}.
        </Text>
        <Text style={styles.lead}>Drivers heading to {nearest.s.name} can book your spot now.</Text>
      </View>

      <Card>
        <Photo src={l.photos[0]} style={styles.photo} />
        <View style={styles.details}>
          <Text style={styles.h2}>{l.title}</Text>
          <Text style={styles.muted}>{pa ? `${pa.line}${pa.unit ? ` #${pa.unit}` : ''}, ${pa.city}, ${pa.state} ${pa.zip}` : `${l.street}, ${l.neighborhood}`}</Text>
          {pa ? (
            <Text style={styles.fine}>
              Drivers see only “{l.street}, {l.neighborhood}” until they book.
            </Text>
          ) : null}
          <View style={styles.chips}>
            <WalkChip minutes={walk.minutes} />
            <RouteBadges routes={nearest.s.routes} max={5} />
          </View>
          <Text style={styles.spec}>
            {l.level}, {l.chargerKw} kW, {l.plug}
            {l.adapters !== 'NONE' ? `, adapter to ${l.plug === 'J1772' ? 'NACS' : 'J1772'}` : ''}
            {l.solarKw > 0 ? `, ${l.solarKw} kW solar` : ''}
          </Text>
          {l.rateSource ? (
            <Text style={styles.body}>
              Electricity rate: ${formatRateInput(l.rate)}/kWh ·{' '}
              {l.rateSource === 'EIA' && l.rateDataMonth
                ? `Massachusetts residential average (EIA, ${formatDataMonth(l.rateDataMonth)}, estimate)`
                : l.rateSource === 'HOST'
                  ? 'your own rate'
                  : 'fallback estimate'}
            </Text>
          ) : null}
          {l.windows.map((w) => (
            <Text key={w.id} style={styles.body}>
              {summarizeDays(w.days)}, {fmtHour(w.start)} to {fmtHour(w.end)}
              {w.end <= w.start ? ' (overnight)' : ''}
            </Text>
          ))}
        </View>
      </Card>

      <View style={styles.prices} accessibilityLabel="What drivers pay">
        {PRICE_CARS.map((car) => {
          const p = computePrice({ charger_kW: l.chargerKw, car_max_AC_kW: car.maxAcKw, local_rate: l.rate, host_earnings_hr: l.earningsHr, booked_hours: 1 });
          return (
            <View key={car.id} style={styles.priceCard}>
              <Text style={styles.priceLabel}>A {car.name} pays</Text>
              <Text style={styles.price}>{p.ok ? `${money(p.value.price_per_hr)}/hr` : 'Not set'}</Text>
              <Text style={styles.fine}>
                You keep {money(l.earningsHr)} + {p.ok ? money(p.value.electricity_cost_per_hr) : 'the cost'} for power
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button
          label="See it in search"
          size="lg"
          block
          onPress={() => {
            update({ destination: stationToDestination(nearest.s) });
            router.navigate('/search' as Href);
          }}
        />
        <Button label="Edit listing" variant="secondary" size="lg" block onPress={() => router.navigate(EDIT_LISTING_PATH as Href)} />
        <Button label="Remove listing" variant="ghost" size="lg" block onPress={() => setConfirmRemove(true)} />
      </View>

      {confirmRemove ? (
        <View style={styles.confirm} accessibilityRole="alert" accessibilityLabel="Remove your listing">
          <Text style={styles.confirmText}>
            {backend
              ? `Remove “${l.title}” from search? Drivers can’t book it anymore. Bookings already made can still finish. You can list again later.`
              : `Remove “${l.title}” from search? Its details and photos are deleted from this phone. You can list again later, but you’ll start from scratch.`}
          </Text>
          <Button label={removing ? 'Removing…' : 'Remove listing'} block disabled={removing} onPress={() => void remove()} />
          <Button label="Keep it" variant="secondary" block onPress={() => setConfirmRemove(false)} />
          {removeError ? <WarnNote>{removeError}</WarnNote> : null}
        </View>
      ) : null}

      <Text style={styles.muted}>Bookings from drivers show up here. Booking notifications aren’t part of this demo, so none have come in yet.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.xs },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: displayTracking(32), color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  lead: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, color: colors.body },
  body: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.body },
  muted: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.muted },
  fine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  spec: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.body },
  photo: { height: 180 },
  details: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  prices: { gap: space.sm },
  priceCard: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, padding: space.md, gap: 2 },
  priceLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.body },
  price: { fontFamily: fonts.bodySemibold, fontSize: 26, color: colors.ink },
  actions: { gap: space.sm },
  confirm: { gap: space.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.amberInk, backgroundColor: colors.amberBg, padding: space.md },
  confirmText: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.amberDeep },
});
