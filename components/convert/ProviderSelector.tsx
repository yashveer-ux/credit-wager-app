/**
 * Horizontal row of provider tiles (monogram + name). Exactly one provider
 * can be selected; the selected tile gets the accent border + soft tint.
 */

import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { PROVIDERS, type Provider } from '../../lib/convert/codes';
import { colors, radius, space } from '../../lib/theme';
import ProviderMonogram from './ProviderMonogram';

export default function ProviderSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (provider: Provider) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {PROVIDERS.map((provider) => {
        const selected = provider.id === selectedId;
        return (
          <Pressable
            key={provider.id}
            accessibilityRole="button"
            accessibilityLabel={`Select ${provider.name}`}
            accessibilityState={{ selected }}
            onPress={() => onSelect(provider)}
            style={({ pressed }) => [
              styles.tile,
              selected && styles.tileSelected,
              pressed && styles.pressed,
            ]}>
            <ProviderMonogram provider={provider} size={44} />
            <Text
              style={[styles.name, selected && styles.nameSelected]}
              numberOfLines={2}
              adjustsFontSizeToFit>
              {provider.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm + 2, paddingRight: space.sm },
  tile: {
    width: 84,
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  tileSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.7 },
  name: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 14,
    minHeight: 28,
  },
  nameSelected: { color: colors.accent },
});
