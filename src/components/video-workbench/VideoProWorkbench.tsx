import React from 'react';
import { Platform } from 'react-native';
import Web from './VideoProWorkbench.web';
import Native from './VideoProWorkbench.native';

type Props = { taskId?: string };

/** Resolves `.web` / `.native` at runtime; satisfies TS imports without `*.web` suffix. */
export default function VideoProWorkbench(props: Props) {
  if (Platform.OS === 'web' && props.taskId) {
    return <Web taskId={props.taskId} />;
  }
  return <Native {...props} />;
}
