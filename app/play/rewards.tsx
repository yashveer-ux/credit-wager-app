import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, PrimaryButton } from '../../components/play/Buttons';
import Chip from '../../components/play/Chip';
import { apiFetch } from '../../lib/api';
import { describeError } from '../../lib/online/blackjack';
import { formatTokens } from '../../lib/play/format';
import { colors, radius, space } from '../../lib/theme';

type Reward = {
  code: string;
  title?: string;
  name?: string;
  description?: string;
  amount?: number | string;
  claimed?: boolean;
  claimable?: boolean;
  expiresAt?: string | null;
};

const rewardTitle = (r: Reward) => r.title ?? r.name ?? r.code;
const isExpired = (r: Reward) => !!r.expiresAt && new Date(r.expiresAt).getTime() < Date.now();

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = (await apiFetch('/rewards')) as { rewards?: Reward[] } | Reward[];
      setRewards(Array.isArray(body) ? body : (body.rewards ?? []));
      setListError(null);
    } catch (e) {
      setListError(describeError(e));
    }
  }, []);

  useEffect(() => {
    // Initial fetch; every setState inside runs after the response lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function redeemPromo() {
    if (promoBusy || !promoCode.trim()) return;
    setPromoBusy(true);
    setPromoMessage(null);
    try {
      await apiFetch('/promo/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      setPromoMessage({ ok: true, text: 'Code redeemed — tokens are on your server wallet.' });
      setPromoCode('');
      void load();
    } catch (e) {
      setPromoMessage({ ok: false, text: describeError(e) });
    } finally {
      setPromoBusy(false);
    }
  }

  async function claim(reward: Reward) {
    if (claiming) return;
    setClaiming(reward.code);
    setClaimError(null);
    try {
      await apiFetch(`/rewards/${encodeURIComponent(reward.code)}/claim`, { method: 'POST' });
      // The server is the source of truth for what changed; refetch.
      await load();
    } catch (e) {
      setClaimError(describeError(e));
    } finally {
      setClaiming(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.headerRow, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Rewards</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.promoCard}>
          <Text style={styles.sectionTitle}>PROMO CODE</Text>
          <View style={styles.promoRow}>
            <TextInput
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder="Enter a code"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.promoInput}
            />
            <PrimaryButton
              label={promoBusy ? '…' : 'Redeem'}
              disabled={promoBusy || promoCode.trim().length === 0}
              onPress={() => void redeemPromo()}
            />
          </View>
          {promoMessage ? (
            <Text style={[styles.promoResult, { color: promoMessage.ok ? colors.positive : colors.negative }]}>
              {promoMessage.text}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YOUR REWARDS</Text>

          {rewards === null && !listError ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : listError ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>{listError}</Text>
              <GhostButton label="Retry" color={colors.accent} onPress={() => void load()} />
            </View>
          ) : rewards && rewards.length === 0 ? (
            <View style={styles.centerBox}>
              <Ionicons name="gift-outline" size={28} color={colors.border} />
              <Text style={styles.emptyText}>No rewards right now. Check back later.</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {rewards?.map((reward, i) => {
                const expired = isExpired(reward);
                const claimed = !!reward.claimed;
                const claimable = !claimed && !expired && reward.claimable !== false;
                return (
                  <View key={reward.code} style={[styles.rewardRow, i > 0 && styles.divider]}>
                    <View style={styles.rewardText}>
                      <Text style={styles.rewardTitle}>{rewardTitle(reward)}</Text>
                      {reward.description ? (
                        <Text style={styles.rewardDesc}>{reward.description}</Text>
                      ) : null}
                      {reward.amount != null ? (
                        <Text style={styles.rewardAmount}>
                          +{formatTokens(Number(reward.amount))} tokens
                        </Text>
                      ) : null}
                    </View>
                    {claimed ? (
                      <Chip label="Claimed" tone="positive" />
                    ) : expired ? (
                      <Chip label="Expired" tone="neutral" />
                    ) : (
                      <GhostButton
                        label={claiming === reward.code ? '…' : 'Claim'}
                        color={colors.accent}
                        disabled={!claimable || claiming !== null}
                        onPress={() => void claim(reward)}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {claimError ? <Text style={styles.claimError}>{claimError}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.xxl },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.bg,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.4 },
  section: { gap: space.md },

  promoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  promoRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  promoInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 1,
  },
  promoResult: { fontSize: 12, fontWeight: '600' },

  centerBox: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 },

  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md + 2,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rewardText: { flex: 1, gap: 2 },
  rewardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rewardDesc: { fontSize: 12, color: colors.muted, lineHeight: 16 },
  rewardAmount: { fontSize: 12, fontWeight: '700', color: colors.positive },
  claimError: { fontSize: 12, color: colors.negative, fontWeight: '600', textAlign: 'center' },
});
