import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import Header from '@/components/Header';
import { Button, Card, Lead, Screen, Title } from '@/components/ui';
import { useApp, type SignOutProblem } from '@/state/AppState';
import { space } from '@/theme';

/**
 * Port of the web's src/pages/SignOut.tsx. Signs out, then goes to the landing screen. It is its own route so the
 * screen the person was on has already unmounted when the account disappears; otherwise a guarded screen would see
 * "no user" first and redirect to sign-up instead of home.
 *
 * If the account's data can't be kept for the next sign-in, nothing is removed and this screen asks first.
 * The web's "set a password first" case is for accounts made before sign-in existed; every account on the phone
 * has a password, so only the full-storage case remains.
 */
export default function SignOut() {
  const { user, car, hostListing, booking, signOut } = useApp();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [problem, setProblem] = useState<SignOutProblem | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return; // StrictMode runs effects twice in development
    tried.current = true;
    const r = signOut();
    if (!r.ok) setProblem(r.reason);
  }, [signOut]);

  if (!user) return <Redirect href="/" />;
  if (!problem) return null; // signing out; the redirect above follows on the next render

  const losing = ['your profile', car && 'your car', hostListing && 'your listing', booking && 'your booking'].filter(Boolean).join(', ');
  const stay = () => router.replace((from || '/') as Href);

  return (
    <Screen header={<Header />}>
      <Card>
        <View>
          <Title>Your account couldn’t be saved for next time</Title>
          <Lead>This phone couldn’t save {losing} while you’re signed out. Signing out now removes them from this phone.</Lead>
        </View>
        <View style={styles.buttons}>
          <Button label="Stay signed in" size="lg" block onPress={stay} />
          <Button label="Sign out anyway" variant="secondary" size="lg" block onPress={() => signOut({ force: true })} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: space.sm },
});
