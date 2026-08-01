import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AchievementBadge from '../../components/rewards/AchievementBadge';
import Card from '../../components/rewards/Card';
import CheckInStrip from '../../components/rewards/CheckInStrip';
import CosmeticItem from '../../components/rewards/CosmeticItem';
import LevelCard from '../../components/rewards/LevelCard';
import RewardRow from '../../components/rewards/RewardRow';
import SectionHeader from '../../components/rewards/SectionHeader';
import { useRewards } from '../../lib/rewards/store';
import { colors, space } from '../../lib/theme';

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const rewards = useRewards();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: space.xxl },
      ]}>
      <Text style={styles.pageTitle}>Rewards 🎁</Text>

      <LevelCard
        level={rewards.level}
        levelTitle={rewards.levelTitle}
        xpIntoLevel={rewards.xpIntoLevel}
        xpForNextLevel={rewards.xpForNextLevel}
        xpProgress={rewards.xpProgress}
        streak={rewards.streak}
      />

      <CheckInStrip
        days={rewards.checkInDays}
        todayClaimed={rewards.todayClaimed}
        onClaim={rewards.claimToday}
      />

      <View>
        <SectionHeader title="Daily missions" subtitle="Reset every day — knock these out for tokens" />
        <Card>
          {rewards.missions.map((m, i) => (
            <View key={m.id}>
              <RewardRow
                icon={m.icon}
                title={m.title}
                progress={m.progress}
                target={m.target}
                rewardTokens={m.rewardTokens}
                claimState={m.claimState}
                onClaim={() => rewards.claimMission(m.id)}
              />
              {i < rewards.missions.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader title="Weekly challenges" subtitle="Bigger goals, bigger payouts" />
        <Card>
          {rewards.weeklyChallenges.map((c, i) => (
            <View key={c.id}>
              <RewardRow
                icon={c.icon}
                title={c.title}
                description={c.description}
                progress={c.progress}
                target={c.target}
                rewardTokens={c.rewardTokens}
                claimState={c.claimState}
                onClaim={() => rewards.claimWeekly(c.id)}
              />
              {i < rewards.weeklyChallenges.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader title="Achievements" subtitle="Permanent badges for standout plays" />
        <View style={styles.grid}>
          {rewards.achievements.map((a) => (
            <AchievementBadge key={a.id} achievement={a} />
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title="Milestone rewards" subtitle="Cumulative lifetime progress" />
        <Card>
          {rewards.milestones.map((m, i) => (
            <View key={m.id}>
              <RewardRow
                icon="flag"
                title={m.title}
                progress={m.progress}
                target={m.target}
                rewardTokens={m.rewardTokens}
                claimState={m.claimState}
                onClaim={() => rewards.claimMilestone(m.id)}
              />
              {i < rewards.milestones.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader title="Cosmetics" subtitle="Purely decorative — claim to unlock, tap to equip" />
        <View style={styles.grid}>
          {rewards.cosmetics.map((c) => (
            <CosmeticItem
              key={c.id}
              cosmetic={c}
              onClaim={() => rewards.claimCosmetic(c.id)}
              onSelect={() => rewards.selectCosmetic(c.id)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, gap: space.xl },
  pageTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 },
});
