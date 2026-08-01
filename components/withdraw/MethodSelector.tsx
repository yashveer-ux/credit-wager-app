import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '../../lib/play/haptics';
import { colors, radius, space } from '../../lib/theme';
import type { PayoutMethod } from '../../lib/withdraw/methods';

/**
 * Radio-style payout method cards plus a demo-only "Add payout method" row.
 * Methods are pre-seeded fixtures — the demo never collects real payment
 * credentials, so the add row only explains itself via an alert.
 */
export default function MethodSelector({
  methods,
  selectedId,
  onSelect,
  disabled,
}: {
  methods: PayoutMethod[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const handleAdd = () => {
    Alert.alert('Demo', 'Managing payout methods is not available in the demo.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Payout method</Text>

      {methods.map((method) => {
        const selected = method.id === selectedId;
        return (
          <Pressable
            key={method.id}
            accessibilityRole="radio"
            accessibilityLabel={`${method.label} ${method.detail}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              haptics.select();
              onSelect(method.id);
            }}
            style={[styles.card, selected && styles.cardSelected, disabled && styles.dimmed]}>
            <View style={[styles.iconChip, selected && styles.iconChipSelected]}>
              <Ionicons
                name={method.icon}
                size={20}
                color={selected ? colors.accent : colors.muted}
              />
            </View>
            <View style={styles.main}>
              <Text style={styles.label}>
                {method.label} <Text style={styles.detail}>{method.detail}</Text>
              </Text>
              <Text style={styles.meta}>
                {method.feeLabel} · {method.eta}
              </Text>
            </View>
            {selected ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
            ) : (
              <View style={styles.radioRing} />
            )}
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add payout method"
        disabled={disabled}
        onPress={handleAdd}
        style={({ pressed }) => [
          styles.addRow,
          pressed && styles.pressed,
          disabled && styles.dimmed,
        ]}>
        <Ionicons name="add-circle-outline" size={20} color={colors.muted} />
        <Text style={styles.addLabel}>Add payout method</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.3 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  cardSelected: { borderColor: colors.accent },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconChipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  main: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { fontSize: 13, fontWeight: '500', color: colors.muted },
  meta: { fontSize: 12, color: colors.muted },
  radioRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: space.md,
  },
  addLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  pressed: { opacity: 0.6 },
  dimmed: { opacity: 0.4 },
});
