import { StyleSheet, Text, View } from 'react-native';

import Header from '@/components/Header';
import { Screen } from '@/components/ui';
import { colors, displayTracking, fonts, space, text } from '@/theme';

// Placeholder until milestone 5 builds the real landing screen; for now it carries the header (sign-in, sign-up, host).
export default function Landing() {
  return (
    <Screen header={<Header />}>
      <View style={styles.body}>
        <Text style={styles.wordmark}>Book, park, charge, go.</Text>
        <Text style={styles.note}>No key handoff. The car never moves, and the host never touches it.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm, paddingTop: space.lg },
  wordmark: { fontFamily: fonts.display, fontSize: text.section, lineHeight: 38, letterSpacing: displayTracking(text.section), color: colors.ink },
  note: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 24, color: colors.body },
});
