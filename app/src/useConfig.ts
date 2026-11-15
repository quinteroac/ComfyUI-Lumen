import { useSyncExternalStore } from 'react';
import { getConfig, subscribeConfig } from './comfy/config';

export function useConfig() {
  return useSyncExternalStore((l) => {
    const off = subscribeConfig(l);
    return () => {
      off();
    };
  }, getConfig);
}
