import { router, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { isBookingLive, isReservationExpired } from '@/shared/features/session/bookingGuard';
import { bookedEndTs } from '@/shared/features/session/settleBooking';
import { fmtClock, fmtRange, money } from '@/shared/lib/format';
import { useApp } from '@/state/AppState';
import { colors, fonts, space, text } from '@/theme';
import { Button } from './ui';

function dayLabel(dayStart: number): string {
  const d = new Date(dayStart);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Port of the web's BookingBanner.tsx. The signed-in driver's booking, at the top of the home screen:
 * - reserved or charging: what it is, and "Open session";
 * - finished: the last trip, with "View receipt";
 * - a reservation whose window passed without a check-in: says so.
 * The last two can be dismissed, which forgets the booking. Renders nothing when there is no booking.
 */
export default function BookingBanner() {
  const { user, booking, listings, update } = useApp();
  if (!user || !booking) return null;
  const listing = listings.find((l) => l.id === booking.listingId);
  if (!listing) return null;

  const now = Date.now();
  const live = isBookingLive(booking, now);
  const expired = isReservationExpired(booking, now);
  const when = `${dayLabel(booking.dayStart)}, ${fmtRange(booking.startHour, booking.hours)}`;

  let status: string;
  let detail: string;
  if (live) {
    status = booking.status === 'ACTIVE' ? 'Charging now' : 'Reserved';
    detail = `${when}, ${booking.carName}. Total ${money(booking.total)}.`;
  } else if (expired) {
    status = 'Reservation ended';
    detail = `${when}. The window ended at ${fmtClock(bookedEndTs(booking))} without a check-in, so no session started.`;
  } else {
    status = 'Last trip';
    const r = booking.result;
    detail = r ? `${when}. Picked up at ${fmtClock(r.pickupAt)}. Total ${money(r.total)}.` : `${when}.`;
  }

  return (
    <View style={[styles.banner, { backgroundColor: live ? colors.brandWash : colors.surface }]} accessibilityLabel={live ? 'Your active booking' : 'Your last booking'}>
      <Text style={[styles.status, { color: live ? colors.brand : colors.muted }]}>{status}</Text>
      <Text style={styles.title}>{listing.title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <View style={styles.actions}>
        {!live && <Button label="Dismiss" variant="ghost" onPress={() => update({ booking: null })} />}
        {live ? (
          <Button label="Open session" onPress={() => router.navigate('/session' as Href)} />
        ) : expired ? (
          <Button label="Find parking" variant="secondary" onPress={() => router.navigate('/search' as Href)} />
        ) : (
          <Button label="View receipt" variant="secondary" onPress={() => router.navigate('/session' as Href)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: 2, paddingHorizontal: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line },
  status: { fontFamily: fonts.bodyMedium, fontSize: text.sm },
  title: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
  detail: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.xs, marginTop: space.sm },
});
