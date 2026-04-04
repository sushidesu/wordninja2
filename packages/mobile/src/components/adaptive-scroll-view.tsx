import React, { PropsWithChildren, useMemo, useState } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

type AdaptiveScrollViewProps = PropsWithChildren<
  ScrollViewProps & {
    extraScrollThreshold?: number;
  }
>;

export function AdaptiveScrollView({
  children,
  extraScrollThreshold = 1,
  onLayout,
  onContentSizeChange,
  scrollEnabled,
  bounces,
  alwaysBounceVertical,
  alwaysBounceHorizontal,
  overScrollMode,
  ...rest
}: AdaptiveScrollViewProps) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const canScrollBySize = useMemo(() => {
    if (containerHeight <= 0) {
      return false;
    }
    return contentHeight > containerHeight + extraScrollThreshold;
  }, [containerHeight, contentHeight, extraScrollThreshold]);

  const resolvedScrollEnabled = (scrollEnabled ?? true) && canScrollBySize;

  return (
    <ScrollView
      {...rest}
      scrollEnabled={resolvedScrollEnabled}
      bounces={resolvedScrollEnabled ? bounces : false}
      alwaysBounceVertical={resolvedScrollEnabled ? alwaysBounceVertical : false}
      alwaysBounceHorizontal={resolvedScrollEnabled ? alwaysBounceHorizontal : false}
      overScrollMode={resolvedScrollEnabled ? overScrollMode : 'never'}
      onLayout={(event) => {
        setContainerHeight(event.nativeEvent.layout.height);
        onLayout?.(event);
      }}
      onContentSizeChange={(width, height) => {
        setContentHeight(height);
        onContentSizeChange?.(width, height);
      }}>
      {children}
    </ScrollView>
  );
}
