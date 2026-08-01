/**
 * Colored monogram chip for an AI provider: brand-color square with the
 * provider's initials in white. Used by the provider selector and the
 * recent-redemptions list. No remote logos or image assets by design.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { Provider } from '../../lib/convert/codes';

export default function ProviderMonogram({
  provider,
  size = 44,
}: {
  provider: Provider;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.chip,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: provider.color },
      ]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]} allowFontScaling={false}>
        {provider.short}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.5 },
});
