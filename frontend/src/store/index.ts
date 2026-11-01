import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import { createApi } from '../api/client';
import { createRepository } from '../offline/repository';
import { createOfflineStorage, type OfflineStorage } from '../offline/storage';
import { authReducer } from './authSlice';
import { dataReducer } from './dataSlice';
import { createSessionStorage, type SessionStorage } from './storage';

export interface StoreDeps {
  api?: ReturnType<typeof createApi>;
  storage?: SessionStorage;
  offline?: OfflineStorage;
}

export function createStore({ api, storage, offline }: StoreDeps = {}) {
  const sessionStorage = storage ?? createSessionStorage();
  const offlineStorage = offline ?? createOfflineStorage();
  const client = api ?? createApi({ store: sessionStorage });
  const repository = createRepository({ api: client, storage: offlineStorage });

  return configureStore({
    reducer: { auth: authReducer, data: dataReducer },
    middleware: (getDefault) =>
      getDefault({
        serializableCheck: false,
        thunk: {
          extraArgument: {
            api: client,
            storage: sessionStorage,
            offline: offlineStorage,
            repository,
          },
        },
      }),
    devTools: __DEV__,
    enhancers: (getDefault) => getDefault({ autoBatch: true }),
  });
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
