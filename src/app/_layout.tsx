// First: the shared API client builds request URLs with `new URL(path, base)`, which React Native's URL lacks.
import 'react-native-url-polyfill/auto';

import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk';
import { Vollkorn_600SemiBold } from '@expo-google-fonts/vollkorn';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { backendConfigFromEnv } from '@/platform/config';
import { createSecureSessionStore } from '@/platform/secureSession';
import { hydrateStore, type SyncStore } from '@/platform/storage';
import { DwellBackend } from '@/shared/state/backend';
import { seedDemoAccount } from '@/shared/state/demoAccount';
import { Button } from '@/components/ui';
import { AppStateProvider } from '@/state/AppState';
import { colors, fonts, text } from '@/theme';

SplashScreen.preventAutoHideAsync();

interface Boot {
  storage: SyncStore;
  backend: DwellBackend | null;
}

/**
 * Like the web's main.tsx: with backend values in .env the app runs against the Dwell backend (Cognito + API);
 * without them it runs the on-device prototype, and development builds seed the demo account.
 */
async function boot(): Promise<Boot> {
  const storage = await hydrateStore();
  const config = backendConfigFromEnv();
  if (config) return { storage, backend: new DwellBackend(config, createSecureSessionStore()) };
  await seedDemoAccount(storage).catch(() => {});
  return { storage, backend: null };
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

/** A saved session couldn't load the account at launch. Nothing is lost: the session stays until they sign out. */
function CantConnect({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <View style={styles.loading}>
      <View style={styles.cantConnect}>
        <Text style={styles.cantTitle} accessibilityRole="header">
          Couldn’t reach Dwell
        </Text>
        <Text style={styles.loadingText}>{message}</Text>
        <Text style={styles.loadingText}>You’re still signed in. Check your connection and try again.</Text>
        <Button label="Try again" size="lg" block onPress={onRetry} />
        <Button label="Sign out" variant="ghost" block onPress={onSignOut} />
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Vollkorn_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });
  const [booted, setBooted] = useState<Boot | null>(null);

  useEffect(() => {
    void boot().then(setBooted);
  }, []);

  // A font that fails to load falls back to the system font rather than keeping the splash up forever.
  const ready = (fontsLoaded || fontError !== null) && booted !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppStateProvider
        storage={booted.storage}
        backend={booted.backend}
        loading={<Loading label="Loading your account…" />}
        startupError={(message, { retry, signOut }) => <CantConnect message={message} onRetry={retry} onSignOut={signOut} />}
      >
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surface },
  loadingText: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 23, color: colors.muted },
  cantConnect: { width: '100%', maxWidth: 420, paddingHorizontal: 24, gap: 12 },
  cantTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
});
