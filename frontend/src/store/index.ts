import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import { createRepository } from '../offline/repository';
import { createOfflineStorage, type OfflineStorage } from '../offline/storage';
import { dataReducer } from './dataSlice';

export interface StoreDeps {
  offline?: OfflineStorage;
}

/** Local-only store: the app has no network client at all. */
export function createStore(deps: StoreDeps = {}) {
  const storage = deps.offline ?? createOfflineStorage();
  const repository = createRepository(storage);

  return configureStore({
    reducer: { data: dataReducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, thunk: { extraArgument: { repository } } }),
    devTools: __DEV__,
    enhancers: (getDefault) => getDefault({ autoBatch: true }),
  });
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
