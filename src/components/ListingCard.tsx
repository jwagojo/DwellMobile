import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Evaluation } from '@/shared/features/search/evaluateListing';
import type { Destination } from '@/shared/types/destination';
import type { Car } from '@/shared/types/listing';
import { colors, fonts, radius, space, text } from '@/theme';
import { GreenPill, LevelTag, NewBadge, Photo, RouteBadges, WalkChip } from './badges';
import { Plug, Sun } from './Icons';
import { WarnNote } from './ui';

/** Port of the web's ListingCard.tsx. The whole card opens the listing; a selected card matches the map's pin. */
export default function ListingCard({ ev, car, destination, selected, onSelect }: { ev: Evaluation; car: Car; destination: Destination | null; selected: boolean; onSelect: () => void }) {
  const l = ev.listing;
  // Routes exist only for T stations. Addresses get none: we do not invent transit service.
  const routes = destination?.routes ?? [];
  const usesAdapter = l.plug !== car.plug && ev.plugOk;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${l.title}, ${l.street}, ${l.neighborhood}. $${ev.pricePerHr.toFixed(2)} per hour, $${ev.total.toFixed(2)} total.`}
      accessibilityHint="Opens the listing"
      onPressIn={onSelect}
      onPress={() => router.navigate(`/listing/${l.id}` as Href)}
      style={({ pressed }) => [styles.card, selected && styles.cardOn, pressed && { backgroundColor: colors.brandWash }]}
    >
      <View style={styles.top}>
        <Photo src={l.photos[0]} index={l.id.length} style={styles.photo}>
          <View style={styles.level}>
            <LevelTag>
              {l.level}, {l.chargerKw} kW
            </LevelTag>
          </View>
        </Photo>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={2}>
            {l.title}
          </Text>
          {l.isNew ? <NewBadge /> : null}
          <Text style={styles.where} numberOfLines={1}>
            {l.street}, {l.neighborhood}
          </Text>
          <Text style={styles.price}>
            ${ev.pricePerHr.toFixed(2)}
            <Text style={styles.unit}>/hr</Text>
          </Text>
          <Text style={styles.total}>${ev.total.toFixed(2)} total</Text>
        </View>
      </View>

      {ev.walkMinutes !== null || routes.length > 0 ? (
        <View style={styles.row}>
          {ev.walkMinutes !== null ? <WalkChip minutes={ev.walkMinutes} /> : null}
          {routes.length > 0 ? <RouteBadges routes={routes} max={5} /> : null}
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.fact}>
          <Plug size={16} color={colors.body} />
          <Text style={styles.factText}>
            {l.plug}, {l.chargerKw} kW
          </Text>
        </View>
        <Text style={styles.factText} accessibilityLabel={`${Math.round(ev.milesAdded)} estimated miles added`}>
          +{Math.round(ev.milesAdded)} mi
        </Text>
        {ev.solarShare !== null ? (
          <View style={styles.fact}>
            <Sun size={16} color={colors.body} />
            <Text style={styles.factText}>{Math.round(ev.solarShare * 100)}% solar</Text>
          </View>
        ) : (
          <Text style={[styles.factText, { color: colors.muted }]}>Solar data unavailable</Text>
        )}
        {ev.greenScore !== null ? <GreenPill score={ev.greenScore} /> : null}
      </View>

      {ev.chargerSlower && car.maxAcKw !== null ? (
        <WarnNote>
          Charger slower than your car's max acceptance rate. Charger is {l.chargerKw} kW; your {car.name} can take {car.maxAcKw} kW.
        </WarnNote>
      ) : null}
      {usesAdapter ? (
        <Text style={styles.adapter}>
          Host leaves a {l.plug} → {car.plug} adapter at the charger
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, padding: 14 },
  cardOn: { borderColor: colors.brand, borderWidth: 2, padding: 13 },
  top: { flexDirection: 'row', gap: space.sm },
  photo: { width: 110, height: 110 },
  level: { position: 'absolute', left: 6, bottom: 6 },
  head: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 21, color: colors.ink },
  where: { fontFamily: fonts.body, fontSize: text.sm, color: colors.muted },
  price: { marginTop: space.xs, fontFamily: fonts.bodySemibold, fontSize: 22, color: colors.ink },
  unit: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  total: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.body },
  adapter: { fontFamily: fonts.body, fontSize: text.sm, color: colors.body },
});
