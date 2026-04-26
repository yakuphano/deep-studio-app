import React from 'react';
import { View, Text } from 'react-native';

type Props = { taskId?: string };

/** Native: pro workbench UI runs on web only (.web.tsx). */
export default function VideoProWorkbench(_props: Props) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#94a3b8', textAlign: 'center' }}>
        Pro video workbench is available on web (desktop).
      </Text>
    </View>
  );
}
