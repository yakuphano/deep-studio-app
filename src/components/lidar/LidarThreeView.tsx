import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { LidarThreeViewProps } from './types';

/** Native: 3D LiDAR editor is web-only */
export default function LidarThreeView(_props: LidarThreeViewProps) {
  return (
    <View style={styles.box}>
      <Text style={styles.t}>The LiDAR 3D editor is only available in the web browser.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 200,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  t: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
});
