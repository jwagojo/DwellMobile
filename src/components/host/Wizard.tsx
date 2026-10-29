import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, space, text } from '@/theme';
import { Button, Card } from '../ui';

/**
 * Port of the web's Wizard.tsx (spec §4.13). The web's left step rail becomes a row of numbered chips above the
 * card; done steps can be tapped to go back. Back, the step count and Continue sit at the bottom.
 */
export default function Wizard({
  title,
  steps,
  current,
  onStepClick,
  stepTitle,
  stepWhy,
  onBack,
  onNext,
  nextLabel,
  busy = false,
  children,
}: {
  title: string;
  steps: string[];
  current: number;
  onStepClick: (index: number) => void;
  stepTitle: string;
  stepWhy: string;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const last = current === steps.length - 1;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.rail} accessibilityLabel="Steps">
        {steps.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}, ${s}${done ? ', done' : isCurrent ? ', current' : ''}`}
              accessibilityState={{ disabled: !done, selected: isCurrent }}
              disabled={!done}
              onPress={() => onStepClick(i)}
              style={styles.railItem}
            >
              <View style={[styles.dot, done ? styles.dotDone : isCurrent ? styles.dotCurrent : styles.dotTodo]}>
                <Text style={[styles.dotText, done && { color: colors.onInk }, isCurrent && { color: colors.brand }]}>{done ? '✓' : i + 1}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <View style={styles.head}>
          <Text style={styles.stepName}>
            Step {current + 1} of {steps.length}: {steps[current]}
          </Text>
          <Text style={styles.stepTitle} accessibilityRole="header">
            {stepTitle}
          </Text>
          <Text style={styles.why}>{stepWhy}</Text>
        </View>
        <View style={styles.body}>{children}</View>
        <View style={styles.footer}>
          <Button label={busy ? 'Publishing…' : (nextLabel ?? (last ? 'Publish listing' : 'Continue'))} size="lg" block disabled={busy} onPress={onNext} />
          {current > 0 ? <Button label="Back" variant="secondary" size="lg" block onPress={onBack} /> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  rail: { flexDirection: 'row', gap: space.xs },
  railItem: { padding: 4 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.brand },
  dotCurrent: { borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.paper },
  dotTodo: { borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper },
  dotText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  head: { gap: 6 },
  stepName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  stepTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  why: { fontFamily: fonts.body, fontSize: text.md, lineHeight: 23, color: colors.body },
  body: { gap: space.lg },
  footer: { gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, paddingTop: space.lg },
});
