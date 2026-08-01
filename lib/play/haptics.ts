/**
 * Thin haptics wrapper. expo-haptics has no effect on web and no-ops safely
 * on simulators without a Taptic Engine, but we guard with try/catch anyway
 * so a haptics failure can never break a game round.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
}

export const haptics = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => safe(() => Haptics.selectionAsync()),
  win: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  lose: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warn: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
};
