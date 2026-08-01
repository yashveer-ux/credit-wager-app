import { StyleSheet, Text, View } from 'react-native';

import { colors, space } from '../../lib/theme';

export default function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2, marginBottom: space.xs },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted },
});
