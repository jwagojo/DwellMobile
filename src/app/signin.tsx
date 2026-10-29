import { Redirect, router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ConfirmEmail from '@/components/ConfirmEmail';
import Header from '@/components/Header';
import { Button, Card, Lead, Screen, TextField, TextLink, Title } from '@/components/ui';
import { SIGNUP_PATH } from '@/shared/lib/hostEntry';
import { authenticate } from '@/shared/state/accounts';
import { DEMO_EMAIL, DEMO_PASSWORD, SHOW_DEMO_HINT } from '@/shared/state/demoAccount';
import { useApp } from '@/state/AppState';
import { colors, fonts, space, text } from '@/theme';
import { EMAIL_RE } from '@/lib/email';

type Errors = Partial<Record<'email' | 'password', string>>;

const LANDING_AFTER_SIGN_IN = '/search' as Href;

/**
 * Port of the web's src/pages/SignIn.tsx. Backend mode: Amazon Cognito, then the account loads from the API.
 * Prototype mode: checks the email and password against the accounts saved on this phone.
 */
export default function SignIn() {
  const { user, signIn, backend, syncAccount, storage } = useApp();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // Backend: the account exists but its email was never confirmed.
  const [confirming, setConfirming] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit() {
    const e: Errors = {};
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter the email you signed up with.';
    if (form.password === '') e.password = 'Enter your password.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    if (backend) return signInWithCognito();

    setBusy(true);
    const result = await authenticate(storage, form.email, form.password);
    setBusy(false);
    if (!result.ok) {
      setErrors({
        password: result.reason === 'INVALID' ? 'That email and password don’t match an account on this phone.' : 'This phone couldn’t check your password just now. Try again.',
      });
      return;
    }
    signIn(result.data);
    router.replace(LANDING_AFTER_SIGN_IN);
  }

  async function signInWithCognito() {
    setBusy(true);
    const r = await backend!.signIn(form.email, form.password);
    if (!r.ok) {
      setBusy(false);
      if (r.code === 'NOT_CONFIRMED') return setConfirming(true);
      setConfirming(false);
      return setErrors({ password: r.message });
    }
    const sync = await syncAccount();
    setBusy(false);
    if (!sync.ok) {
      setConfirming(false);
      return setErrors({ password: sync.message });
    }
    router.replace(LANDING_AFTER_SIGN_IN);
  }

  // Already signed in: nothing to do here.
  if (user) return <Redirect href={LANDING_AFTER_SIGN_IN} />;

  return (
    <Screen header={<Header />}>
      <Card>
        {confirming && backend ? (
          <ConfirmEmail backend={backend} email={form.email.trim()} onConfirmed={signInWithCognito} />
        ) : (
          <>
            <View>
              <Title>Sign in to Dwell</Title>
              <Lead>Pick up where you left off, as a driver, a host, or both.</Lead>
            </View>
            <TextField
              label="Email"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              value={form.email}
              error={errors.email}
              onChangeText={(v) => set('email', v)}
            />
            <TextField
              label="Password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              autoCapitalize="none"
              value={form.password}
              error={errors.password}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              onChangeText={(v) => set('password', v)}
            />
            <Button label={busy ? 'Signing in…' : 'Sign in'} size="lg" block disabled={busy} onPress={onSubmit} />
            <Text style={styles.alt}>
              New to Dwell? <TextLink label="Create an account" onPress={() => router.replace(SIGNUP_PATH as Href)} />
            </Text>
          </>
        )}
      </Card>
      {SHOW_DEMO_HINT && !backend ? (
        <Text style={styles.demo}>
          Development build only: try {DEMO_EMAIL} with password {DEMO_PASSWORD}.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  alt: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: 'center' },
  demo: { fontFamily: fonts.body, fontSize: text.xs, color: colors.muted, marginTop: -space.xs },
});
