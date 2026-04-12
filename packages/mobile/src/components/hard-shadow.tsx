import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * deviationgame.com の `box-shadow: 3px 3px 0 0 purple` を iOS/Android 両対応で再現。
 *
 * RN のネイティブ shadow はぼかせるが「shadowRadius: 0 の完全ハード影」は iOS しか出せず、
 * Android の `elevation` はそもそもぼかし付きなのでハード影にならない。
 * そこで: 裏に同形・同サイズの矩形 View を offset 分ずらして重ねる二重構造で再現する。
 *
 * レイアウト的には wrapper に `paddingRight/Bottom = offset` で余白を確保して、
 * content は padded area に自然フロー。shadow は absolute で (offset, offset) に配置。
 * 結果: 影は content と同サイズで、右下へ offset 分ハミ出して見える。
 *
 * 使い方:
 *   <HardShadow>
 *     <View style={{ borderWidth: 3, borderColor: Colors.ink, backgroundColor: Colors.canvas }}>
 *       ...
 *     </View>
 *   </HardShadow>
 *
 * 注意: 子要素は **透明でない塗り** を持つこと (でないと影が透けて見える)。
 */

type Props = Omit<ViewProps, 'style'> & {
  /** 影の offset (px)。deviation の既定は 3、embed 系は 4。 */
  offset?: number;
  /** 影の色。既定は `Colors.ink`。 */
  shadowColor?: string;
  /** ラッパー View 自体の追加スタイル。 */
  style?: StyleProp<ViewStyle>;
};

export function HardShadow({
  offset = 3,
  shadowColor = Colors.ink,
  style,
  children,
  ...rest
}: Props) {
  return (
    <View
      style={[{ paddingRight: offset, paddingBottom: offset }, style]}
      {...rest}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: offset,
          left: offset,
          right: 0,
          bottom: 0,
          backgroundColor: shadowColor,
        }}
      />
      {children}
    </View>
  );
}
