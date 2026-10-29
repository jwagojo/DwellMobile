import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DwellBackend } from '@/shared/state/backend';
import { colors, fonts, space, text } from '@/theme';
import { Button, Lead, TextField, Title } from './ui';

/**
 * Port of the web's src/components/ConfirmEmail.tsx. Backend mode: enter the code Cognito emailed after sign-up.
 * Confirming creates the profile (post-confirmation trigger), then `onConfirmed` signs the person in. Used by
 * sign-up and by sign-in for an unconfirmed account.
 */
export default function ConfirmEmail({ backend, email, onConfirmed }: { backend: DwellBackend; email: string; onConfirmed: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError('');
    const r = await backend.confirm(email, code);
    if (!r.ok && r.code !== 'NOT_AUTHORIZED') {
      setBusy(false);
      return setError(r.message);
    }
    // NOT_AUTHORIZED here means the account is already confirmed, so signing in is the right next step.
    await onConfirmed();
    setBusy(false);
  }

  async function resend() {
    setNotice('');
    setError('');
    const r = await backend.resendCode(email);
    if (r.ok) setNotice(`We sent a new code to ${email}.`);
    else setError(r.message);
  }

  return (
    <View style={styles.body}>
      <View>
        <Title>Check your email</Title>
        <Lead>We sent a 6-digit code to {email}. Enter it to confirm your account.</Lead>
      </View>
      <TextField
        label="Confirmation code"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        value={code}
        error={error || undefined}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        onChangeText={(v) => {
          setCode(v.replace(/\D/g, '').slice(0, 6));
          setError('');
        }}
      />
      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      <Button label={busy ? 'Confirming…' : 'Confirm and continue'} size="lg" block disabled={busy} onPress={onSubmit} />
      <Button label="Send a new code" variant="link" onPress={resend} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.lg },
  notice: { fontFamily: fonts.body, fontSize: text.sm, color: colors.greenInk },
});
