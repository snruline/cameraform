import React from 'react';
import {StyleSheet, ViewStyle, ImageStyle} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  clamp,
} from 'react-native-reanimated';

/**
 * รูปภาพที่ pinch-to-zoom + pan ได้
 * - 1 นิ้วลาก (ตอน zoom in แล้ว) = pan
 * - 2 นิ้วหนีบ = zoom
 * - double-tap = toggle 1x ↔ 2.5x
 *
 * ข้อสังเกต: ต้องห่อด้วย GestureHandlerRootView ที่ root ของแอป (มีแล้วใน App.tsx)
 */

interface Props {
  uri: string;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  minScale?: number;
  maxScale?: number;
  /**
   * 'contain' (ค่า default) = เห็นภาพทั้งใบ อาจมีแถบดำรอบ — ใช้กับ fullscreen viewer
   * 'cover' = เต็มกรอบ ยอม crop — ใช้กับภาพ preview ในกรอบสี่เหลี่ยม
   */
  resizeMode?: 'contain' | 'cover';
}

export const ZoomableImage: React.FC<Props> = ({
  uri,
  style,
  containerStyle,
  minScale = 1,
  maxScale = 4,
  resizeMode = 'contain',
}) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = clamp(savedScale.value * e.scale, minScale * 0.8, maxScale);
    })
    .onEnd(() => {
      if (scale.value < minScale) {
        // bounce back to min
        scale.value = withSpring(minScale);
        savedScale.value = minScale;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate(e => {
      if (scale.value > 1) {
        translateX.value = savedX.value + e.translationX;
        translateY.value = savedY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1.01;
      if (zoomed) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan);
  const all = Gesture.Exclusive(doubleTap, composed);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: translateX.value},
      {translateY: translateY.value},
      {scale: scale.value},
    ],
  }));

  return (
    <GestureDetector gesture={all}>
      <Animated.View style={[styles.container, containerStyle]}>
        <Animated.Image
          source={{uri}}
          style={[styles.img, style, animStyle]}
          resizeMode={resizeMode}
        />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
  },
});
