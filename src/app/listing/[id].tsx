import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo, RouteBadges } from '@/components/badges';
import CarPicker from '@/components/CarPicker';
import Header from '@/components/Header';
import { Camera, ChevronLeft, Walk } from '@/components/Icons';
import SelectField from '@/components/SelectField';
import { Button, Card, FitNote, InfoNote, Screen, Stepper, TextLink, WarnNote } from '@/components/ui';
import { placeName } from '@/shared/data/destinations';
import { LINE_STYLES } from '@/shared/data/transit';
import { lateRatePerMinute, settle } from '@/shared/engines/billing';
import { GREEN_REF_CO2_KG, GREEN_REF_TRANSIT_MILES, GREEN_WEIGHTS, LATE_MULTIPLIER, SERVICE_FEE } from '@/shared/engines/constants';
import { evaluateListing } from '@/shared/features/search/evaluateListing';
import { bookingBlock, startHasPassed } from '@/shared/features/session/bookingGuard';
import { todayIndex } from '@/shared/lib/availability';
import { fmtHour, money, todayMidnight } from '@/shared/lib/format';
import { metersToMiles } from '@/shared/lib/geo';
import { SIGNUP_PATH } from '@/shared/lib/hostEntry';
import type { Booking } from '@/shared/types/booking';
import { useApp } from '@/state/AppState';
import { colors, displayTracking, fonts, radius, space, text } from '@/theme';

/** Port of the web's src/pages/ListingPage.tsx, stacked for a phone: details first, the booking panel at the end. */

const GALLERY_LABELS = ['Driveway from the street', 'Charger', 'Adapter', 'Your spot'];
const MAX_KW_SCALE = 12;
const HOURS_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function FitBar({ label, kw, tone }: { label: string; kw: number | null; tone: 'grey' | 'brand' }) {
  return (
    <View style={styles.fitRow} accessibilityLabel={`${label}: ${kw !== null ? `${kw} kilowatts` : 'unknown'}`}>
      <Text style={styles.fitLabel}>{label}</Text>
      <View style={styles.fitTrack}>{kw !== null ? <View style={[styles.fitFill, { width: `${Math.min(kw / MAX_KW_SCALE, 1) * 100}%`, backgroundColor: tone === 'brand' ? colors.brand : colors.disabled }]} /> : null}</View>
      <Text style={styles.fitValue}>{kw !== null ? `${kw} kW` : 'Unknown'}</Text>
    </View>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[styles.line, strong && styles.lineTotal]}>
      <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, cars, activeCar, destination, startHour, hours, listings, booking: currentBooking, hostListing, update, backend, syncAccount } = useApp();
  const [busy, setBusy] = useState(false);
  const [bookError, setBookError] = useState('');

  const listing = listings.find((l) => l.id === id);
  if (!user) return <Redirect href={SIGNUP_PATH as Href} />;
  if (!listing) {
    return (
      <Screen header={<Header />}>
        <Card>
          <Text style={styles.h1}>We couldn’t find that listing</Text>
          <TextLink label="Back to search" onPress={() => router.navigate('/search' as Href)} />
        </Card>
      </Screen>
    );
  }

  const ev = evaluateListing(listing, activeCar, destination, { startHour, hours, dayIndex: todayIndex() });
  if (!ev) return <Redirect href="/search" />;

  const bill = settle({ price_per_hr: ev.pricePerHr, booked_hours: hours, booked_end_timestamp: 0, pickup_timestamp: 0 });
  const subtotal = bill.ok ? bill.value.subtotal : 0;
  const serviceFee = bill.ok ? bill.value.service_fee : 0;
  const lateRate = lateRatePerMinute(ev.pricePerHr);
  const usesAdapter = listing.plug !== activeCar.plug && ev.plugOk;
  const carLimits = activeCar.maxAcKw !== null && activeCar.maxAcKw < listing.chargerKw;
  // One booking per account, so a reserved or running session must finish before another starts.
  const now = Date.now();
  const block = bookingBlock(listing.id, currentBooking, hostListing?.id ?? null, now);
  const startPassed = startHasPassed(startHour, now);
  const nowHour = new Date(now).getHours();
  const blockedTitle = block?.kind === 'ACTIVE_BOOKING' ? (listings.find((l) => l.id === block.booking.listingId)?.title ?? 'another charger') : '';
  const canBook = ev.plugOk && ev.open && block === null && !startPassed;

  async function book() {
    if (!ev || !canBook) return;
    if (backend) return bookOnServer();
    const booking: Booking = {
      id: `bk-${Date.now()}`,
      listingId: listing!.id,
      dayStart: todayMidnight(),
      destination,
      startHour,
      hours,
      carName: activeCar.name,
      carKw: activeCar.maxAcKw,
      pEff: ev.pEff,
      pricePerHr: ev.pricePerHr,
      total: ev.total,
      status: 'RESERVED',
    };
    update({ booking });
    router.navigate('/session' as Href);
  }

  /**
   * Backend: the server reruns every check and prices the booking for the car saved on the profile, so save the car
   * shown here first. These numbers are display only; the session shows what the server froze.
   */
  async function bookOnServer() {
    setBusy(true);
    setBookError('');
    const saved = await backend!.api.saveCar(activeCar);
    const created = saved.ok ? await backend!.api.createBooking({ listingId: listing!.id, startHour, hours, destination }) : saved;
    if (!created.ok) {
      setBusy(false);
      return setBookError(created.message);
    }
    await syncAccount(); // loads the booking with the exact address and instructions
    setBusy(false);
    router.navigate('/session' as Href);
  }

  const t = ev.greenTerms;
  const gallery = GALLERY_LABELS.map((label, i) => ({ label, src: listing.photos[i] }));

  return (
    <Screen header={<Header />}>
      <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/search' as Href))} style={styles.back} hitSlop={6}>
        <ChevronLeft size={18} color={colors.ink} />
        <Text style={styles.backText}>Back to search</Text>
      </Pressable>

      <View style={styles.gallery}>
        <Photo src={gallery[0].src} index={0} label={gallery[0].label} style={styles.hero} />
        <View style={styles.thumbs}>
          {gallery.slice(1).map((g, i) => (
            <Photo key={g.label} src={g.src} index={i + 1} label={g.label} style={styles.thumb} />
          ))}
          <View style={[styles.thumb, styles.more]} accessibilityRole="image" accessibilityLabel="More photos">
            <Camera size={24} color={colors.body} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h1} accessibilityRole="header">
          {listing.title}
        </Text>
        <Text style={styles.body}>
          {listing.street}, {listing.neighborhood}
        </Text>
        <Text style={styles.muted}>Hosted by {listing.hostName}. Exact address after booking.</Text>
        <View style={styles.facts}>
          {[
            { k: 'Charger', v: `${listing.level}, ${listing.chargerKw} kW` },
            { k: 'Plug', v: listing.plug, sub: listing.adapters !== 'NONE' ? 'Adapter available' : undefined },
            { k: 'Solar', v: listing.solarKw > 0 ? `${listing.solarKw} kW` : 'None' },
            { k: 'Spots', v: String(listing.spots) },
          ].map((c) => (
            <View key={c.k} style={styles.factCell}>
              <Text style={styles.factKey}>{c.k}</Text>
              <Text style={styles.factValue}>{c.v}</Text>
              {c.sub ? <Text style={styles.factSub}>{c.sub}</Text> : null}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2} accessibilityRole="header">
          {destination ? `Your trip to ${placeName(destination)}` : 'Your trip'}
        </Text>
        {!destination || ev.walkMinutes === null || ev.walkMeters === null ? (
          <View style={styles.box}>
            <Text style={styles.muted}>
              You haven’t chosen a destination, so there is no walk or route to show. <TextLink label="Choose one in search" onPress={() => router.navigate('/search' as Href)} />.
            </Text>
          </View>
        ) : (
          <View style={styles.box}>
            <View style={styles.tripRow}>
              <Walk size={22} color={colors.ink} />
              <View style={styles.flex}>
                <Text style={styles.tripTitle}>
                  {ev.walkMinutes} min walk · {metersToMiles(ev.walkMeters).toFixed(1)} mi
                </Text>
                <Text style={styles.muted}>
                  Estimated from straight-line distance, from {listing.street} to {placeName(destination)}
                </Text>
              </View>
            </View>
            {destination.routes && destination.routes.length > 0 ? (
              <View style={[styles.tripRow, styles.tripRule]}>
                <View style={[styles.tBadge, { backgroundColor: destination.primary ? LINE_STYLES[destination.primary].stroke : colors.muted }]} aria-hidden>
                  <Text style={styles.tBadgeText}>T</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.tripTitle}>Routes serving {placeName(destination)}</Text>
                  <View style={styles.routes}>
                    <RouteBadges routes={destination.routes} max={destination.routes.length} />
                  </View>
                </View>
              </View>
            ) : (
              <Text style={[styles.muted, styles.tripRule, { paddingTop: space.md }]}>Transit routes aren’t shown for addresses yet. Pick a T station as your destination to see the routes that serve it.</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.h2} accessibilityRole="header">
          Charger fit for your car
        </Text>
        <CarPicker cars={cars} value={activeCar} onChange={(next) => update({ car: next })} />
        <View style={[styles.box, { gap: space.sm }]}>
          <FitBar label="Charger" kw={listing.chargerKw} tone="grey" />
          <FitBar label="Your car max" kw={activeCar.maxAcKw} tone="grey" />
          <FitBar label="You’ll draw" kw={ev.pEff} tone="brand" />
        </View>
        {activeCar.maxAcKw === null ? (
          <FitNote tone="amber">We don’t know your car’s top speed, so the price assumes the charger’s full {listing.chargerKw} kW.</FitNote>
        ) : ev.chargerSlower ? (
          <FitNote tone="amber">
            This charger tops out at {listing.chargerKw} kW. Your {activeCar.name} can take {activeCar.maxAcKw} kW, so charging will be slower than your car allows.
          </FitNote>
        ) : carLimits ? (
          <FitNote tone="green">
            Your {activeCar.name} tops out at {activeCar.maxAcKw} kW, so you pay for {activeCar.maxAcKw} kW of power, not the charger’s {listing.chargerKw} kW.
          </FitNote>
        ) : (
          <FitNote tone="green">This charger and your {activeCar.name} are a good match at {ev.pEff} kW.</FitNote>
        )}
        {usesAdapter ? (
          <Text style={styles.body}>
            Host leaves a {listing.plug} → {activeCar.plug} adapter at the charger.
          </Text>
        ) : null}
        {!ev.plugOk ? (
          <WarnNote>
            The plug doesn’t fit your {activeCar.name} ({activeCar.plug}) and this host has no adapter for it.
          </WarnNote>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.greenHead}>
          <Text style={styles.h2} accessibilityRole="header">
            Green Score
          </Text>
          {ev.greenScore !== null ? (
            <Text style={styles.greenBig}>
              {ev.greenScore.toFixed(2)} <Text style={styles.muted}>/ 1.00</Text>
            </Text>
          ) : null}
        </View>
        {t && ev.solarShare !== null ? (
          <View style={styles.box}>
            {[
              { term: 'Solar share', numbers: `${Math.round(t.solar.value * 100)}% of the charge`, weight: GREEN_WEIGHTS.solar, score: t.solar.score },
              { term: 'Transit miles replaced', numbers: `${t.transit.value.toFixed(1)} mi ÷ ${GREEN_REF_TRANSIT_MILES} mi (max 1)`, weight: GREEN_WEIGHTS.transit, score: t.transit.score },
              { term: 'CO₂ avoided vs. gas', numbers: `${t.co2.value.toFixed(1)} kg ÷ ${GREEN_REF_CO2_KG} kg (max 1)`, weight: GREEN_WEIGHTS.co2, score: t.co2.score },
            ].map((r, i) => (
              <View key={r.term} style={[styles.termRow, i > 0 && styles.tripRule]} accessibilityLabel={`${r.term}: ${r.numbers}, times ${r.weight.toFixed(2)}, score ${r.score.toFixed(3)}`}>
                <View style={styles.flex}>
                  <Text style={styles.termName}>{r.term}</Text>
                  <Text style={styles.muted}>
                    {r.numbers} × {r.weight.toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.termScore}>{r.score.toFixed(3)}</Text>
              </View>
            ))}
            <View style={[styles.termRow, styles.tripRule]}>
              <Text style={[styles.termName, styles.flex]}>Green Score</Text>
              <Text style={[styles.termScore, { color: colors.greenInk }]}>{ev.greenScore?.toFixed(3)}</Text>
            </View>
          </View>
        ) : (
          <WarnNote>
            {destination ? 'Solar data unavailable, so we can’t show a Green Score right now.' : 'Choose a destination in search to see a Green Score. It needs the miles of transit you would ride instead of drive.'}
          </WarnNote>
        )}
        <Text style={styles.fine}>
          Estimates, not meter readings. Charging while the host’s panels are producing means more of that solar power is used locally (local solar self-consumption), which raises the score. Assumes a 1 kW house load, 80% system efficiency and a sample sunny day.{' '}
          {destination ? `Transit miles are the straight-line distance to ${placeName(destination)}. ` : ''}Gas car 0.40 kg CO₂/mi, grid 0.33 kg CO₂/kWh (placeholder values).
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2} accessibilityRole="header">
          Parking instructions
        </Text>
        <Text style={styles.bodyLong}>{listing.instructions}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2} accessibilityRole="header">
          Good to know
        </Text>
        {[
          `Pickup ends your session. Minutes after your booked end cost ${money(lateRate)}/min.`,
          'Leaving early? There’s no refund for unused hours.',
          'Cancellation isn’t part of this demo yet.',
          'Miles are estimates. Set your own charge limit in your car’s app.',
        ].map((s) => (
          <Text key={s} style={styles.bodyLong}>
            •  {s}
          </Text>
        ))}
      </View>

      <Card style={styles.panel}>
        <View>
          <Text style={styles.panelPrice}>
            {money(ev.pricePerHr)}
            <Text style={styles.muted}>/hr</Text>
          </Text>
          <Text style={styles.muted}>for your {activeCar.name}</Text>
        </View>

        <View style={styles.window}>
          <View style={styles.windowCell}>
            <SelectField label="Start" value={startHour} options={HOURS_OPTIONS.map((h) => ({ value: h, label: fmtHour(h), disabled: h < nowHour }))} onChange={(h) => update({ startHour: h })} />
          </View>
          <View style={styles.windowCell}>
            <Text style={styles.endLabel}>End</Text>
            <Text style={styles.endValue}>{fmtHour(startHour + hours)}</Text>
          </View>
        </View>

        <View style={styles.hoursRow}>
          <Text style={styles.termName}>Hours</Text>
          <Stepper label="Hours" value={hours} min={1} max={12} onChange={(n) => update({ hours: n })} format={(n) => `${n} h`} />
        </View>

        <View style={styles.lines}>
          <Line label={`Electricity · ${ev.pEff} kW × $${listing.rate.toFixed(2)}`} value={`${money(ev.electricityPerHr)}/hr`} />
          <Line label="Host earnings" value={`${money(listing.earningsHr)}/hr`} />
          <Line label={`${money(ev.pricePerHr)} × ${hours} h`} value={money(subtotal)} />
          <Line label={`Service fee (${Math.round(SERVICE_FEE * 100)}%)`} value={money(serviceFee)} />
          <Line label="Total" value={money(ev.total)} strong />
        </View>

        <View style={styles.stats}>
          <View style={styles.flex}>
            <Text style={styles.statLabel}>Estimated miles added</Text>
            <Text style={styles.statValue}>+{Math.round(ev.milesAdded)} mi</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.statLabel, { color: colors.amberInk }]}>Late rate ({LATE_MULTIPLIER}×)</Text>
            <Text style={[styles.statValue, { color: colors.amberDeep }]}>{money(lateRate)}/min</Text>
          </View>
        </View>

        {block?.kind === 'OWN_LISTING' ? (
          <InfoNote>This is your listing, so you can’t book it. Drivers see it in search.</InfoNote>
        ) : block?.kind === 'ACTIVE_BOOKING' ? (
          <View style={{ gap: space.xs }}>
            <WarnNote>
              You already have a session {block.booking.status === 'ACTIVE' ? 'running' : 'reserved'} at {blockedTitle}. Pick up your car and finish it before booking another.
            </WarnNote>
            <Button label="Open session" variant="secondary" block onPress={() => router.navigate('/session' as Href)} />
          </View>
        ) : startPassed ? (
          <WarnNote>{fmtHour(startHour)} has already passed today. Pick a later start to book.</WarnNote>
        ) : !ev.plugOk ? (
          <WarnNote>This plug doesn’t fit your {activeCar.name} and the host has no adapter, so booking is turned off.</WarnNote>
        ) : !ev.open ? (
          <WarnNote>This charger isn’t open for your whole window. Try another time or charger.</WarnNote>
        ) : (
          <Button label={busy ? 'Booking…' : `Book for ${money(ev.total)}`} size="lg" block disabled={busy} onPress={book} />
        )}
        {bookError ? <WarnNote>{bookError}</WarnNote> : null}
        <Text style={[styles.muted, { textAlign: 'center' }]}>Payment is simulated in this demo. No key handoff, the car never moves, and the host never touches it.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, alignSelf: 'flex-start', marginTop: -space.sm },
  backText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  gallery: { gap: space.xs },
  hero: { height: 220 },
  thumbs: { flexDirection: 'row', gap: space.xs },
  thumb: { flex: 1, height: 76 },
  more: { borderRadius: radius.card, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  section: { gap: space.sm },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 35, letterSpacing: displayTracking(32), color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 23, color: colors.body },
  bodyLong: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 25, color: colors.body },
  muted: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.muted },
  strong: { fontFamily: fonts.bodySemibold, color: colors.ink, fontSize: 17 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, overflow: 'hidden', marginTop: space.xs },
  factCell: { width: '50%', padding: space.md, borderColor: colors.line, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: colors.paper },
  factKey: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  factValue: { fontFamily: fonts.bodySemibold, fontSize: 18, color: colors.ink, marginTop: 2 },
  factSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: space.md, backgroundColor: colors.paper },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tripRule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, marginTop: space.md, paddingTop: space.md },
  tripTitle: { fontFamily: fonts.bodySemibold, fontSize: text.md, color: colors.ink },
  tBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tBadgeText: { fontFamily: fonts.bodySemibold, fontSize: 18, color: colors.onInk },
  routes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fitLabel: { width: 100, fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.body },
  fitTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.chip, overflow: 'hidden' },
  fitFill: { height: '100%', borderRadius: 6 },
  fitValue: { width: 72, textAlign: 'right', fontFamily: fonts.bodySemibold, fontSize: text.sm, color: colors.ink },
  greenHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  greenBig: { fontFamily: fonts.bodySemibold, fontSize: 28, color: colors.greenInk },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  termName: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  termScore: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.ink },
  fine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.muted },
  panel: { gap: space.lg },
  panelPrice: { fontFamily: fonts.bodySemibold, fontSize: 30, color: colors.ink },
  window: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  windowCell: { flex: 1 },
  endLabel: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink, marginBottom: 6 },
  endValue: { height: 48, lineHeight: 48, fontFamily: fonts.bodyMedium, fontSize: text.md, color: colors.ink },
  hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lines: { gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  lineTotal: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: space.sm },
  lineLabel: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.body },
  lineValue: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  stats: { flexDirection: 'row', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: space.sm },
  statLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  statValue: { fontFamily: fonts.bodySemibold, fontSize: 20, color: colors.ink, marginTop: 2 },
});
