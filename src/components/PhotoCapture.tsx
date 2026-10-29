import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { takePhoto, type PhotoSource } from '@/platform/photos';
import { colors, fonts, radius, space, text } from '@/theme';
import { Camera } from './Icons';

/** Arrival and pickup photos are 640 px on the longest side, like the web's. */
const SESSION_PHOTO_DIM = 640;

/**
 * Port of the web's PhotoCapture.tsx (spec §4.12): a dashed box until a photo exists, then green with a thumbnail.
 * The camera is the main way in; the library is offered too, for phones and simulators without a usable camera.
 */
export default function PhotoCapture({
  title,
  reason,
  savedTitle,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  reason: string;
  savedTitle: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState('');

  async function capture(source: PhotoSource) {
    setError('');
    const r = await takePhoto(source, { maxDim: SESSION_PHOTO_DIM });
    if (r.ok) return onChange(r.dataUrl);
    if (r.reason !== 'CANCELLED') setError(r.message);
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, value ? styles.boxDone : styles.boxEmpty]}>
        {value ? (
          <Image source={{ uri: value }} style={styles.thumb} accessibilityLabel="Your saved photo" />
        ) : (
          <View style={styles.icon}>
            <Camera size={26} color={colors.muted} />
          </View>
        )}
        <View style={styles.flex}>
          <Text style={styles.title}>{value ? savedTitle : title}</Text>
          <Text style={styles.reason}>{reason}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `Retake: ${title}` : `Open camera: ${title}`}
          disabled={disabled}
          onPress={() => void capture('camera')}
          style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.brandTint, borderColor: colors.brand }, disabled && { opacity: 0.55 }]}
        >
          <Text style={styles.buttonText}>{value ? 'Retake' : 'Open camera'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo from your library instead" disabled={disabled} onPress={() => void capture('library')} hitSlop={6}>
          <Text style={styles.link}>Choose from library</Text>
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.xs },
  box: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.card, borderWidth: 2, padding: space.md },
  boxEmpty: { borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.paper },
  boxDone: { borderColor: colors.brand, backgroundColor: colors.greenBg },
  thumb: { width: 56, height: 56, borderRadius: radius.card },
  icon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bodySemibold, fontSize: text.md, color: colors.ink },
  reason: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 20, color: colors.body },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  button: { height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, paddingHorizontal: 20, justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodyMedium, fontSize: text.md, color: colors.ink },
  link: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink, textDecorationLine: 'underline', textDecorationColor: colors.lineStrong },
  error: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.amberInk },
});
