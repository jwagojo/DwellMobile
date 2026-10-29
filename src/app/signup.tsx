import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ConfirmEmail from '@/components/ConfirmEmail';
import Header from '@/components/Header';
import { Button, Card, CheckboxCard, Lead, Screen, SectionTitle, TextField, TextLink, Title, WarnNote } from '@/components/ui';
import { parseUsPhone, PASSWORD_HINT, passwordError, toE164Us } from '@/shared/lib/accountRules';
import { NEW_LISTING_PATH, SIGNIN_PATH } from '@/shared/lib/hostEntry';
import { registerAccount } from '@/shared/state/accounts';
import { useApp } from '@/state/AppState';
import { EMAIL_RE } from '@/lib/email';
import { colors, fonts, space } from '@/theme';

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password' | 'confirmPassword' | 'terms' | 'form', string>>;


/**
 * Port of the web's src/pages/SignUp.tsx. The one sign-up. The account is not a driver or a host: it can do both.
 * `?next=host` (from "Host an EV charger") continues to the listing steps afterwards.
 */
export default function SignUp() {
  const params = useLocalSearchParams<{ next?: string }>();
  const { user, update, backend, syncAccount, storage } = useApp();
  const forHosting = params.next === 'host';
  const afterSignUp = (forHosting ? NEW_LISTING_PATH : '/search') as Href;

  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirmPassword: '', terms: false });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // Backend: Cognito emailed a code; the account exists but is not confirmed yet.
  const [confirming, setConfirming] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function validate(): Errors {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!parseUsPhone(form.phone)) e.phone = 'Enter a 10-digit US phone number.';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    // Same rules as the Cognito user pool (lib/accountRules.ts).
    const pw = passwordError(form.password);
    if (pw) e.password = pw;
    // Exact match: Cognito keeps every character, including inner spaces.
    if (form.confirmPassword === '') e.confirmPassword = 'Type your password again.';
    else if (form.confirmPassword !== form.password) e.confirmPassword = 'The passwords don’t match.';
    if (!form.terms) e.terms = 'Accept the terms to continue.';
    return e;
  }

  async function onSubmit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    if (backend) return signUpWithCognito();

    // No car is asked for here: someone who only hosts has no EV to price for. Search lets them pick one.
    const newUser = { name: form.name.trim(), email: form.email.trim(), phone: parseUsPhone(form.phone)! };
    // The password is saved only as a salted hash (shared/state/accounts.ts), so this phone can sign the account back in.
    setBusy(true);
    const result = await registerAccount(storage, form.password, { user: newUser, car: null, hostListing: null, booking: null });
    setBusy(false);
    if (!result.ok) {
      setErrors(
        result.reason === 'EXISTS'
          ? { email: 'An account with this email already exists on this phone. Sign in instead.' }
          : { form: 'This phone couldn’t save your password just now. Try again.' },
      );
      return;
    }
    update({ user: newUser });
    router.replace(afterSignUp);
  }

  /** Backend mode: create the Cognito account. The form already enforces the pool's password and phone rules. */
  async function signUpWithCognito() {
    setBusy(true);
    const r = await backend!.signUp({ email: form.email, password: form.password, name: form.name, phoneE164: toE164Us(parseUsPhone(form.phone)!) });
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'EXISTS') return setErrors({ email: r.message });
      if (r.code === 'INVALID_PASSWORD') return setErrors({ password: r.message });
      return setErrors({ form: r.message });
    }
    if (r.value.confirmed) return finishSignIn();
    setConfirming(true);
  }

  /** After confirmation: sign in with the password still in the form, then load the new profile. */
  async function finishSignIn() {
    const s = await backend!.signIn(form.email, form.password);
    if (!s.ok) {
      setConfirming(false);
      return setErrors({ form: s.message });
    }
    await syncAccount();
    router.replace(afterSignUp);
  }

  // Already signed in: there is nothing to create. Send them where this sign-up was headed.
  if (user) return <Redirect href={afterSignUp} />;

  return (
    <Screen header={<Header />}>
      <Card>
        {confirming && backend ? (
          <ConfirmEmail backend={backend} email={form.email.trim()} onConfirmed={finishSignIn} />
        ) : (
          <>
            <View>
              <Title>Create your Dwell account</Title>
              <Lead>Start parking or hosting</Lead>
            </View>

            <View style={styles.section}>
              <SectionTitle>Your account</SectionTitle>
              <TextField label="Full name" autoComplete="name" textContentType="name" autoCapitalize="words" value={form.name} error={errors.name} onChangeText={(v) => set('name', v)} />
              <TextField label="Phone" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" value={form.phone} error={errors.phone} onChangeText={(v) => set('phone', v)} />
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
                autoComplete="new-password"
                textContentType="newPassword"
                autoCapitalize="none"
                hint={PASSWORD_HINT}
                value={form.password}
                error={errors.password}
                onChangeText={(v) => set('password', v)}
              />
              <TextField
                label="Confirm password"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                autoCapitalize="none"
                value={form.confirmPassword}
                error={errors.confirmPassword}
                onChangeText={(v) => set('confirmPassword', v)}
              />
            </View>

            <CheckboxCard checked={form.terms} onChange={(v) => set('terms', v)} lead="I agree to the Dwell terms." error={errors.terms}>
              Pickup ends my session, late minutes are billed, and there is no refund for unused hours.
            </CheckboxCard>

            {errors.form ? <WarnNote>{errors.form}</WarnNote> : null}
            <Button label={busy ? 'Creating…' : 'Create Account'} size="lg" block disabled={busy} onPress={onSubmit} />
            <Text style={styles.alt}>
              Already have an account? <TextLink label="Sign in" onPress={() => router.replace(SIGNIN_PATH as Href)} />
            </Text>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  alt: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: 'center' },
});
