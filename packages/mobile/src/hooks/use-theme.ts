/**
 * テーマ色フック。
 * 現在はライトテーマ一本 (Leaf Pop) のため、単に `Colors` を返すだけ。
 * 将来ダークテーマを足す場合はここで分岐する。
 */

import { Colors } from '@/constants/theme';

export function useTheme() {
  return Colors;
}
