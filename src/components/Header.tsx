import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HOST_HOME_PATH, SIGNIN_PATH, SIGNUP_PATH, hostEntryPath } from '@/shared/lib/hostEntry';
import { useApp } from '@/state/AppState';
import { colors, fonts, space } from '@/theme';
import { Bolt } from './Icons';
import { Button } from './ui';

/**
 * Port of the web's src/components/Header.tsx at phone width: the logo and account buttons on the first row, the
 * host button full-width on its own row (the web does the same below its lg breakpoint).
 */

export function Logo() {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="Dwell home" onPress={() => router.navigate('/')} style={styles.logo} hitSlop={6}>
      <Bolt size={20} color={colors.brand} />
      <Text style={styles.wordmark}>Dwell</Text>
    </Pressable>
  );
}

/**
 * The one host entry point. One account both drives and hosts, so the label follows what the account has:
 * "Host an EV charger" until something is listed, then "Switch to Hosting". On any host screen it reads
 * "Switch to Driving" (to search), so there is always a way back.
 */
function HostButton() {
  const { user, hostListing } = useApp();
  const pathname = usePathname();

  let label = 'Host an EV charger';
  let to = hostEntryPath(user !== null, hostListing !== null);
  const onHostPage = pathname === HOST_HOME_PATH || pathname.startsWith(`${HOST_HOME_PATH}/`);
  if (user && onHostPage) {
    label = 'Switch to Driving';
    to = '/search';
  } else if (user && hostListing) {
    label = 'Switch to Hosting';
    to = HOST_HOME_PATH;
  }
  return <Button label={label} variant="secondary" size="nav" block onPress={() => router.navigate(to as Href)} />;
}

export default function Header() {
  const { user } = useApp();
  const pathname = usePathname();

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <Logo />
        {user ? (
          <View style={styles.actions}>
            <View style={styles.avatar} accessibilityRole="image" accessibilityLabel={`Signed in as ${user.name}`}>
              <Text style={styles.avatarText}>{user.name.trim().charAt(0).toUpperCase() || '?'}</Text>
            </View>
            <Button label="Sign out" variant="ghost" size="nav" onPress={() => router.replace({ pathname: '/signout', params: { from: pathname } })} />
          </View>
        ) : (
          <View style={styles.actions}>
            <Button label="Sign in" variant="ghost" size="nav" onPress={() => router.navigate(SIGNIN_PATH as Href)} />
            <Button label="Sign up" size="nav" onPress={() => router.navigate(SIGNUP_PATH as Href)} />
          </View>
        )}
      </View>
      <HostButton />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.paper,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44 },
  wordmark: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper3, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.brand },
});
