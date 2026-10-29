import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, displayTracking, fonts, space, text } from '@/theme';

// Milestone 1 placeholder: proves the theme and fonts load. The real landing screen replaces it in milestone 5.
export default function Landing() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.wordmark}>Dwell</Text>
        <Text style={styles.lead}>Book, park, charge, go.</Text>
        <Text style={styles.note}>No key handoff. The car never moves, and the host never touches it.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.md, gap: space.sm },
  wordmark: { fontFamily: fonts.display, fontSize: text.display, letterSpacing: displayTracking(text.display), color: colors.ink },
  lead: { fontFamily: fonts.bodyMedium, fontSize: text.lead, color: colors.ink2 },
  note: { fontFamily: fonts.body, fontSize: text.sm, color: colors.muted },
});
