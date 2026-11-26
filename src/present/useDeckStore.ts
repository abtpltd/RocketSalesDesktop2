import { useMemo } from 'react';
import type { SessionInfo } from '../api/types';
import { dbName, idbStore } from './store';

/** This person's own presentations store (one per person and company, on this computer). */
export function useDeckStore(info: SessionInfo) {
  return useMemo(() => idbStore(dbName(info.company.domain, info.user.email)), [info.company.domain, info.user.email]);
}
