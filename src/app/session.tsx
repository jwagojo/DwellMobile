import { Redirect, router, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PaidPill, Photo, StatTile, StatusDot } from '@/components/badges';
import Header from '@/components/Header';
import PhotoCapture from '@/components/PhotoCapture';
import { Button, Card, Screen, Segmented, Title, WarnNote } from '@/components/ui';
import { locateUser } from '@/platform/location';
import { uploadPhoto } from '@/platform/upload';
import { lateRatePerMinute } from '@/shared/engines/billing';
import { MILES_PER_KWH, PICKUP_RADIUS_M, SERVICE_FEE } from '@/shared/engines/constants';
import { isReservationExpired } from '@/shared/features/session/bookingGuard';
import { checkPickupDistance } from '@/shared/features/session/pickup';
import { bookedEndTs, bookedStartTs, settleBooking } from '@/shared/features/session/settleBooking';
import { fmtClock, fmtDuration, fmtRange, money } from '@/shared/lib/format';
import { haversineDistanceMeters, offsetNorth, type LatLng } from '@/shared/lib/geo';
import { SIGNUP_PATH } from '@/shared/lib/hostEntry';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius, space, text } from '@/theme';

/**
 * Port of the web's src/pages/Session.tsx: Arrived → Charging → Pickup → Done, with the same rules, copy and demo
 * controls. Backend mode uploads the photos to S3 and lets the server check in, recheck the 50 m geofence and settle.
 */

type Step = 'arrived' | 'charging' | 'pickup' | 'done';
type ClockMode = 'early' | 'ontime' | 'late' | 'real';
type PhoneMode = 'car' | 'far' | 'gps';
type Loc =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; meters: number; pos: LatLng }
  | { kind: 'far'; meters: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

const STEPS: { id: Step; label: string }[] = [
  { id: 'arrived', label: 'Arrived' },
  { id: 'charging', label: 'Charging' },
  { id: 'pickup', label: 'Pickup' },
  { id: 'done', label: 'Done' },
];

function Panel({ tone, title, body, action }: { tone: 'surface' | 'green' | 'amber'; title: string; body?: string; action?: ReactNode }) {
  const bg = { surface: colors.surface, green: colors.greenBg, amber: colors.amberBg }[tone];
  const head = { surface: colors.ink, green: colors.greenInk, amber: colors.amberDeep }[tone];
  const sub = { surface: colors.body, green: colors.greenInk, amber: colors.amberInk }[tone];
  return (
    <View style={[styles.panel, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <View style={styles.flex}>
        <Text style={[styles.panelTitle, { color: head }]}>{title}</Text>
        {body ? <Text style={[styles.panelBody, { color: sub }]}>{body}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export default function Session() {
  const { user, booking, listings, update, backend, applyBooking } = useApp();
  // Backend: the server's clock settles the bill, so the screen shows the real time too.
  const [clock, setClock] = useState<ClockMode>(backend ? 'real' : 'early');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [phone, setPhone] = useState<PhoneMode>('car');
  // The location check is never kept: after a restart the driver checks again, which is what the geofence needs.
  const [loc, setLoc] = useState<Loc>({ kind: 'idle' });
  const [msgNote, setMsgNote] = useState(false);
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The real clock moves; re-render every 30 s while it is selected.
  useEffect(() => {
    if (clock !== 'real') return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [clock]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!user) return <Redirect href={SIGNUP_PATH as Href} />;

  const listing = booking ? listings.find((l) => l.id === booking.listingId) : undefined;
  if (!booking || !listing) {
    return (
      <Screen header={<Header />}>
        <Card>
          <Title>No active booking</Title>
          <Text style={styles.body}>Book a charger and your session will show up here.</Text>
          <Button label="Find parking" size="lg" onPress={() => router.navigate('/search' as Href)} />
        </Card>
      </Screen>
    );
  }

  const b = booking;

  // A reservation whose window passed without a check-in. Nothing to run, and nothing is charged.
  if (isReservationExpired(b, Date.now())) {
    return (
      <Screen header={<Header />}>
        <Card>
          <Title>This reservation has ended</Title>
          <Text style={styles.body}>
            {listing.title}, {fmtRange(b.startHour, b.hours)}. The window ended at {fmtClock(bookedEndTs(b))} without a check-in, so no session started.
          </Text>
          <Button label="Find parking" size="lg" block onPress={() => router.navigate('/search' as Href)} />
          <Button label="Dismiss" variant="secondary" size="lg" block onPress={() => update({ booking: null })} />
        </Card>
      </Screen>
    );
  }

  // Photos and the pickup step live on the booking, so restarting the app mid-session loses nothing.
  const pickupStage = b.pickupStarted ?? false;
  const arrivalPhoto = b.arrivalPhoto ?? null;
  const pickupPhoto = b.pickupPhoto ?? null;
  const setPickupStage = (started: boolean) => update({ booking: { ...b, pickupStarted: started } });
  /** Backend: a photo counts only once it is in S3 (Req 5.2); a failed upload keeps the step and offers a retry. */
  async function savePhoto(kind: 'arrival' | 'pickup', photo: string | null) {
    const field = kind === 'arrival' ? 'arrivalPhoto' : 'pickupPhoto';
    setActionError('');
    if (!backend || photo === null) return update({ booking: { ...b, [field]: photo } });
    setBusy(true);
    const r = await uploadPhoto(backend.api, { kind, bookingId: b.id }, photo);
    setBusy(false);
    if (!r.ok) return setActionError(r.message);
    update({ booking: { ...b, [field]: photo } });
  }

  async function startSession() {
    if (!backend) return update({ booking: { ...b, status: 'ACTIVE' } });
    setBusy(true);
    setActionError('');
    const r = await backend.api.checkIn(b.id);
    setBusy(false);
    if (!r.ok) return setActionError(r.message);
    applyBooking(r.data.booking);
  }

  const endTs = bookedEndTs(b);
  const startTs = bookedStartTs(b);
  const nowTs = { early: endTs - 30 * 60_000, ontime: endTs, late: endTs + 25 * 60_000, real: Date.now() }[clock];
  const step: Step = b.status === 'COMPLETED' ? 'done' : b.status === 'RESERVED' ? 'arrived' : pickupStage ? 'pickup' : 'charging';
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const minutesLeft = Math.round((endTs - nowTs) / 60_000);
  const progress = Math.min(Math.max((nowTs - startTs) / (endTs - startTs), 0), 1);
  const estMiles = Math.round(b.pEff * b.hours * MILES_PER_KWH);
  const milesSoFar = Math.round(estMiles * progress);
  const locOk = loc.kind === 'ok' || loc.kind === 'denied';

  // One update per action: separate updates built from the same `b` would overwrite each other.
  function jump(to: Step) {
    setLoc({ kind: 'idle' });
    if (to === 'arrived') update({ booking: { ...b, status: 'RESERVED', result: undefined, pickupStarted: false } });
    else if (to === 'charging' || to === 'pickup') update({ booking: { ...b, status: 'ACTIVE', result: undefined, pickupStarted: to === 'pickup' } });
    else void finish(false);
  }

  async function finish(flagged: boolean) {
    if (backend) return finishOnServer(flagged);
    const result = settleBooking(b, listing!, nowTs, flagged);
    if (!result) return;
    update({ booking: { ...b, status: 'COMPLETED', result, pickupStarted: false } });
  }

  /** Backend: the server rechecks the 50 m geofence and settles with its own clock. */
  async function finishOnServer(flagged: boolean) {
    const position = !flagged && loc.kind === 'ok' ? loc.pos : null;
    setBusy(true);
    setActionError('');
    const r = await backend!.api.pickup(b.id, position);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'TOO_FAR' && typeof r.details.metersShown === 'number') return setLoc({ kind: 'far', meters: r.details.metersShown });
      return setActionError(r.message);
    }
    applyBooking(r.data.booking);
  }

  function checkLocation() {
    clearTimeout(timer.current);
    setLoc({ kind: 'checking' });
    const evaluate = (pos: LatLng) => {
      // Exact distance for the check; the rounded number is only for display.
      const { ok, metersShown } = checkPickupDistance(haversineDistanceMeters(pos, listing!));
      setLoc(ok ? { kind: 'ok', meters: metersShown, pos } : { kind: 'far', meters: metersShown });
    };
    if (phone === 'gps') {
      void locateUser({ precise: true }).then((r) => {
        if (r.ok) return evaluate({ lat: r.lat, lng: r.lng });
        setLoc(r.reason === 'DENIED' || r.reason === 'UNSUPPORTED' ? { kind: 'denied' } : { kind: 'unavailable' });
      });
      return;
    }
    timer.current = setTimeout(() => evaluate(offsetNorth(listing!, phone === 'car' ? 18 : 420)), 600);
  }

  /* ---------- Step bodies ---------- */

  const arrived = (
    <Card>
      <Title>You’ve arrived</Title>
      {listing.privateAddress ? (
        <Text style={styles.address}>
          Address: {listing.privateAddress.line}
          {listing.privateAddress.unit ? ` #${listing.privateAddress.unit}` : ''}, {listing.privateAddress.city}, {listing.privateAddress.state} {listing.privateAddress.zip}
        </Text>
      ) : null}
      <Text style={styles.bodyLong}>{listing.instructions}</Text>
      <View style={styles.trio}>
        {['Street view', 'Charger', 'Your spot'].map((label, i) => (
          <Photo key={label} src={listing.photos[i]} index={i} label={label} style={styles.trioPhoto} />
        ))}
      </View>
      <PhotoCapture
        title="Take an arrival photo"
        reason="It shows the spot and charger as you found them, for you and the host."
        savedTitle="Arrival photo saved"
        value={arrivalPhoto}
        disabled={busy}
        onChange={(p) => void savePhoto('arrival', p)}
      />
      <View style={styles.bullets}>
        <Text style={styles.body}>•  Set your charge limit in your car’s app.</Text>
        <Text style={styles.body}>•  Plug in and check the car shows it’s charging.</Text>
      </View>
      <Button label={busy ? 'Saving…' : 'I’m plugged in. Start session'} size="lg" block disabled={!arrivalPhoto || busy} onPress={() => void startSession()} />
      {!arrivalPhoto ? <Text style={styles.muted}>Add your arrival photo to start.</Text> : null}
    </Card>
  );

  const charging = (
    <Card>
      <StatusDot>Charging</StatusDot>
      <View>
        <Text style={styles.countdown} accessibilityRole="header">
          {minutesLeft >= 0 ? `${fmtDuration(minutesLeft)} left` : `${Math.abs(minutesLeft)} min late`}
        </Text>
        <Text style={[styles.body, minutesLeft < 0 && { color: colors.amberInk, fontFamily: fonts.bodyMedium }]}>
          Booking ends {fmtClock(endTs)}. After that, {money(lateRatePerMinute(b.pricePerHr))}/min.
        </Text>
      </View>
      <View>
        <Text style={styles.statLabel}>Estimated miles added so far</Text>
        <Text style={styles.statValue}>
          +{milesSoFar} <Text style={styles.muted}>of +{estMiles} mi</Text>
        </Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Booking time used" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Button label="I’m back at the car. Pick up" size="lg" block onPress={() => setPickupStage(true)} />
      <Button label="Message host" variant="secondary" size="lg" block onPress={() => setMsgNote(true)} />
      {msgNote ? (
        <Text style={styles.muted} accessibilityLiveRegion="polite">
          Messaging isn’t part of this demo.
        </Text>
      ) : null}
    </Card>
  );

  const pickup = (
    <Card>
      <Title>Pick up your car</Title>
      {loc.kind === 'idle' ? <Panel tone="surface" title="Check that you are at the car" action={<Button label="Check location" variant="secondary" onPress={checkLocation} />} /> : null}
      {loc.kind === 'checking' ? <Panel tone="surface" title="Checking your location…" /> : null}
      {loc.kind === 'ok' ? <Panel tone="green" title={`You’re at the car, ${loc.meters} m away`} body={`Within the ${PICKUP_RADIUS_M} m pickup radius.`} /> : null}
      {loc.kind === 'far' ? (
        <Panel tone="amber" title={`You’re ${loc.meters} m from the car`} body={`Pickup opens within ${PICKUP_RADIUS_M} m. Late minutes keep counting.`} action={<Button label="Try again" variant="secondary" onPress={checkLocation} />} />
      ) : null}
      {loc.kind === 'denied' ? <Panel tone="amber" title="Location unavailable" body="You can still pick up with a photo. The host reviews it." /> : null}
      {loc.kind === 'unavailable' ? (
        <Panel tone="amber" title="We couldn’t get your location in time" body="Try again. Your session stays open until you pick up." action={<Button label="Try again" variant="secondary" onPress={checkLocation} />} />
      ) : null}
      <PhotoCapture title="Take a pickup photo" reason="It shows the spot as you left it." savedTitle="Pickup photo saved" value={pickupPhoto} disabled={busy} onChange={(p) => void savePhoto('pickup', p)} />
      <Button label={`Confirm Pickup at ${fmtClock(nowTs)}`} size="lg" block disabled={!locOk || !pickupPhoto || busy} onPress={() => void finish(loc.kind === 'denied')} />
      {!locOk || !pickupPhoto ? <Text style={styles.muted}>{!locOk ? `Check your location first (within ${PICKUP_RADIUS_M} m of the car).` : 'Add your pickup photo.'}</Text> : null}
      <Text style={styles.fine}>If location is turned off for Dwell, you can still pick up with a photo and the host reviews it.</Text>
    </Card>
  );

  const r = b.result;
  const done = r ? (
    <Card>
      <View>
        <Text style={styles.picked}>
          Picked up at {fmtClock(r.pickupAt)}
          {r.flagged ? ', flagged for host review' : ''}
        </Text>
        <Title>Trip complete</Title>
      </View>
      <View style={styles.lines}>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>
            {money(b.pricePerHr)} × {b.hours} h
          </Text>
          <Text style={styles.lineValue}>{money(r.subtotal)}</Text>
        </View>
        {r.lateMinutes > 0 ? (
          <View style={styles.line}>
            <Text style={[styles.lineLabel, { color: colors.amberInk }]}>Late, {r.lateMinutes} min</Text>
            <Text style={[styles.lineValue, { color: colors.amberInk }]}>{money(r.lateFee)}</Text>
          </View>
        ) : null}
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Service fee ({Math.round(SERVICE_FEE * 100)}%)</Text>
          <Text style={styles.lineValue}>{money(r.serviceFee)}</Text>
        </View>
        <View style={[styles.line, styles.lineTotal]}>
          <Text style={styles.totalText}>Total</Text>
          <Text style={styles.totalText}>{money(r.total)}</Text>
        </View>
      </View>
      <View style={styles.tiles}>
        <StatTile big label="Estimated miles added" value={`+${Math.round(r.milesAdded)} mi`} />
        <StatTile big label="Solar share" value={r.solarShare !== null ? `${Math.round(r.solarShare * 100)}%` : 'Unavailable'} />
        <StatTile big label="CO₂ vs. gas" value={r.co2Kg !== null ? `${r.co2Kg.toFixed(1)} kg` : 'Unavailable'} />
        <StatTile big tone="green" label="Green Score" value={r.greenScore !== null ? r.greenScore.toFixed(2) : 'Unavailable'} />
      </View>
      {b.arrivalPhoto || b.pickupPhoto ? (
        <View style={styles.photos}>
          {[
            { src: b.arrivalPhoto, label: 'Arrival photo' },
            { src: b.pickupPhoto, label: 'Pickup photo' },
          ]
            .filter((p): p is { src: string; label: string } => Boolean(p.src))
            .map((p) => (
              <View key={p.label} style={styles.figure}>
                <Image source={{ uri: p.src }} style={styles.figureImg} accessibilityLabel={p.label} />
                <Text style={styles.statLabel}>{p.label}</Text>
              </View>
            ))}
        </View>
      ) : null}
      <Button label="Book another charger" size="lg" block onPress={() => router.navigate('/search' as Href)} />
    </Card>
  ) : null;

  return (
    <Screen header={<Header />}>
      <View style={styles.steps} accessibilityLabel={`Session progress: step ${stepIndex + 1} of 4, ${STEPS[stepIndex].label}`}>
        {STEPS.map((s, i) => (
          <View key={s.id} style={styles.stepCell}>
            <View style={[styles.stepBar, { backgroundColor: i <= stepIndex ? colors.brand : colors.lineStrong }]} />
            <Text style={[styles.stepLabel, { color: i <= stepIndex ? colors.ink : colors.muted }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summary}>
        <Photo src={listing.photos[0]} style={styles.summaryPhoto} />
        <View style={styles.flex}>
          <Text style={styles.summaryTitle}>{listing.title}</Text>
          <Text style={styles.muted}>
            {fmtRange(b.startHour, b.hours)}, {b.carName}, {b.pEff} kW draw
          </Text>
        </View>
        <PaidPill amount={money(b.total)} />
      </View>

      {actionError ? <WarnNote>{actionError}</WarnNote> : null}
      {busy && step !== 'done' ? (
        <Text style={styles.muted} accessibilityLiveRegion="polite">
          Saving…
        </Text>
      ) : null}
      {step === 'arrived' && arrived}
      {step === 'charging' && charging}
      {step === 'pickup' && pickup}
      {step === 'done' && done}

      <View style={styles.demo} accessibilityLabel="Demo controls">
        <Text style={styles.demoTitle}>Demo controls</Text>
        {backend ? (
          <Text style={styles.muted}>Connected to the Dwell backend: the server’s clock and records decide the steps and the bill, so only the phone location can be simulated.</Text>
        ) : (
          <>
            <Segmented<Step> label="Jump to step" value={step} onChange={jump} options={STEPS.map((s) => ({ value: s.id, label: s.label }))} />
            <Segmented<ClockMode>
              label="Clock at pickup"
              value={clock}
              onChange={setClock}
              options={[
                { value: 'early', label: '30 min early' },
                { value: 'ontime', label: 'On time' },
                { value: 'late', label: '25 min late' },
                { value: 'real', label: 'Real clock' },
              ]}
            />
          </>
        )}
        <Segmented<PhoneMode>
          label="Phone location"
          value={phone}
          onChange={(m) => {
            setPhone(m);
            setLoc({ kind: 'idle' });
          }}
          options={[
            { value: 'car', label: 'At the car' },
            { value: 'far', label: '420 m away' },
            { value: 'gps', label: 'Real GPS' },
          ]}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 23, color: colors.body },
  bodyLong: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 25, color: colors.body },
  muted: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.muted },
  fine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  address: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  trio: { flexDirection: 'row', gap: space.xs },
  trioPhoto: { flex: 1, height: 96 },
  bullets: { gap: 6 },
  countdown: { fontFamily: fonts.bodySemibold, fontSize: 40, lineHeight: 44, color: colors.ink },
  statLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  statValue: { fontFamily: fonts.bodySemibold, fontSize: 22, color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.chip, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.brand },
  panel: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, borderRadius: radius.card, padding: space.md },
  panelTitle: { fontFamily: fonts.bodySemibold, fontSize: text.md },
  panelBody: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20 },
  picked: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.greenInk, marginBottom: 2 },
  lines: { gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  lineTotal: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: space.sm },
  lineLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.body },
  lineValue: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  totalText: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photos: { flexDirection: 'row', gap: space.md },
  figure: { gap: 6 },
  figureImg: { width: 128, height: 96, borderRadius: radius.card },
  steps: { flexDirection: 'row', gap: space.xs },
  stepCell: { flex: 1 },
  stepBar: { height: 6, borderRadius: 3 },
  stepLabel: { marginTop: space.xs, fontFamily: fonts.bodyMedium, fontSize: text.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, padding: space.md },
  summaryPhoto: { width: 56, height: 56 },
  summaryTitle: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
  demo: { gap: space.md, borderRadius: radius.card, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.disabled, backgroundColor: colors.paper, padding: space.md },
  demoTitle: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.muted },
});
