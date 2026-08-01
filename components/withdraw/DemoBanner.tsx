import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';

/** Slim, always-visible reminder that the payout flow is a demo. */
export default function DemoBanner() {
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
      <Text style={styles.text}>Demo mode — no real funds leave this app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm - 2,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  text: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
