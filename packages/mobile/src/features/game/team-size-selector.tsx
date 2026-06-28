import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

/**
 * チーム数セレクタ（リファレンスの "Card Merge" パターン）。
 *
 * 2/3/4 を縦積みの全幅カードで選ぶ。各カードは「N チーム構成」＋各チームの色ドットと人数、
 * 下端に人数比の比率バーを表示する。選択中は枠が締まり、3px オフセットのハードシャドウが
 * フェードインして浮く。プレイヤー数がチーム数に満たないカードはロックして選べない。
 *
 * リファレンス再現の要点:
 * - shadow-[3px_3px_0px_0px] = 角丸を 3px ずらした硬い影 → 実 View をオフセット配置し opacity をアニメ。
 * - transition-all duration-300 = 選択時に影・枠色が 300ms で遷移。
 * - active:translate = 押下で 1px 沈む。
 */
const TEAM_COUNTS = [2, 3, 4] as const;
const SHADOW_OFFSET = 3;
const BORDER = 3;
const RADIUS = 12;
const DURATION = 300;

/** チーム分けの色（リファレンス: emerald / amber / rose / indigo の 400）。 */
const TEAM_SPLIT_COLORS = ['#34D399', '#FBBF24', '#FB7185', '#818CF8'];

type Props = {
  value: number;
  onChange: (teams: number) => void;
  playersCount: number;
  /** 選べる最大チーム数。これを超えるカードはロックされる。 */
  maxTeams: number;
};

/** プレイヤーを round-robin で配ったときの各チーム人数（誰が入るかは秘匿、人数だけ）。 */
function teamSizes(teamCount: number, playersCount: number): number[] {
  const sizes = Array(teamCount).fill(0);
  for (let i = 0; i < playersCount; i++) sizes[i % teamCount]++;
  return sizes;
}

export function TeamSizeSelector({ value, onChange, playersCount, maxTeams }: Props) {
  return (
    <View style={styles.list}>
      {TEAM_COUNTS.map((num) => (
        <TeamCard
          key={num}
          num={num}
          selected={value === num}
          disabled={num > maxTeams}
          sizes={teamSizes(num, playersCount)}
          onPress={() => onChange(num)}
        />
      ))}
    </View>
  );
}

type CardProps = {
  num: number;
  selected: boolean;
  disabled: boolean;
  sizes: number[];
  onPress: () => void;
};

function TeamCard({ num, selected, disabled, sizes, onPress }: CardProps) {
  const sel = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, { duration: DURATION });
  }, [selected, sel]);

  // 押下中はカードが影の位置(+offset)へ沈むぶん、影は消える。
  const shadowStyle = useAnimatedStyle(() => ({ opacity: sel.value * (1 - press.value) }));
  // 選択で枠が締まり(slate-200→ink)、押下でカードが影へ沈む。
  const cardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(sel.value, [0, 1], [Colors.paperDeep, Colors.ink]),
    transform: [
      { translateX: press.value * SHADOW_OFFSET },
      { translateY: press.value * SHADOW_OFFSET },
    ],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 70 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120 });
      }}
      style={styles.pressable}>
      {/* 3px オフセットのハードシャドウ。カードと同形・同サイズで右下にずらす。 */}
      <Animated.View pointerEvents="none" style={[styles.shadow, shadowStyle]} />

      <Animated.View style={[styles.card, disabled && styles.cardDisabled, cardStyle]}>
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <ThemedText type="label" themeColor={selected ? 'ink' : 'inkSoft'}>
              {num} チーム構成
            </ThemedText>
            {selected && <Text style={styles.check}>✓</Text>}
          </View>

          <View style={styles.dotsRow}>
            {sizes.map((size, idx) => (
              <View key={idx} style={styles.dotItem}>
                <View style={[styles.dot, { backgroundColor: TEAM_SPLIT_COLORS[idx] }]} />
                <ThemedText type="caption" themeColor="inkSoft">
                  {size}人
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* 比率バー（人数比で各セグメントの幅が決まり、人数変化でアニメする） */}
        <View style={styles.bar}>
          {sizes.map((size, idx) => (
            <BarSegment
              key={idx}
              size={size}
              color={TEAM_SPLIT_COLORS[idx]}
              last={idx === sizes.length - 1}
            />
          ))}
        </View>

        {disabled && (
          <View style={styles.lockOverlay}>
            <ThemedText type="labelSm" themeColor="inkMute">
              🔒 要 {num} 人以上
            </ThemedText>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function BarSegment({ size, color, last }: { size: number; color: string; last: boolean }) {
  const flex = useSharedValue(size);

  useEffect(() => {
    flex.value = withTiming(size, { duration: DURATION });
  }, [size, flex]);

  const style = useAnimatedStyle(() => ({ flex: flex.value }));

  return <Animated.View style={[{ backgroundColor: color }, !last && styles.barDivider, style]} />;
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.md,
  },
  pressable: {
    // 影がハミ出すぶんの余白を margin で確保（padding にするとカードと影のサイズがずれて二重オフセットになる）。
    marginRight: SHADOW_OFFSET,
    marginBottom: SHADOW_OFFSET,
  },
  shadow: {
    // カードと同サイズで重ね、translate で右下にずらす（padding の解決に依らず確実にハミ出す）。
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.ink,
    borderRadius: RADIUS,
    transform: [{ translateX: SHADOW_OFFSET }, { translateY: SHADOW_OFFSET }],
  },
  card: {
    borderWidth: BORDER,
    borderRadius: RADIUS,
    backgroundColor: Colors.canvas,
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.4,
    backgroundColor: Colors.paper,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  check: {
    color: Colors.ink,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  dotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bar: {
    height: 14,
    flexDirection: 'row',
    backgroundColor: Colors.paperDeep,
  },
  barDivider: {
    borderRightWidth: 1,
    borderRightColor: Colors.overlay,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
