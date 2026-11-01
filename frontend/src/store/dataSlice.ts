import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { Repository } from '../offline/repository';
import type { Dashboard, Duty, Exam, Homework, Subject, UniformChecklist } from '../api/types';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DataState {
  dashboard: { data: Dashboard | null; status: LoadStatus; error: string | null };
  duties: { data: Duty[]; status: LoadStatus; error: string | null };
  homework: { data: Homework[]; status: LoadStatus; error: string | null };
  exams: { data: Exam[]; status: LoadStatus; error: string | null };
  subjects: { data: Subject[]; status: LoadStatus; error: string | null };
  uniform: { data: UniformChecklist | null; status: LoadStatus; error: string | null };
}

const initialState: DataState = {
  dashboard: { data: null, status: 'idle', error: null },
  duties: { data: [], status: 'idle', error: null },
  homework: { data: [], status: 'idle', error: null },
  exams: { data: [], status: 'idle', error: null },
  subjects: { data: [], status: 'idle', error: null },
  uniform: { data: null, status: 'idle', error: null },
};

interface DataDeps {
  repository: Repository;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Gagal memuat data.';
}

export const loadDashboard = createAsyncThunk<Dashboard, void, { extra: DataDeps }>(
  'data/dashboard',
  async (_arg, { extra }) => extra.repository.dashboard(),
);

export const loadDuties = createAsyncThunk<Duty[], void, { extra: DataDeps }>(
  'data/duties',
  async (_arg, { extra }) => (await extra.repository.duties({ limit: '50' })).items,
);

export const completeDuty = createAsyncThunk<Duty, string, { extra: DataDeps }>(
  'data/completeDuty',
  async (id, { extra }) => (await extra.repository.completeDuty(id)).duty,
);

export const loadHomework = createAsyncThunk<Homework[], void, { extra: DataDeps }>(
  'data/homework',
  async (_arg, { extra }) => (await extra.repository.homework()).items,
);

export const loadExams = createAsyncThunk<Exam[], void, { extra: DataDeps }>(
  'data/exams',
  async (_arg, { extra }) => (await extra.repository.exams()).items,
);

export const loadSubjects = createAsyncThunk<Subject[], void, { extra: DataDeps }>(
  'data/subjects',
  async (_arg, { extra }) => (await extra.repository.subjects()).items,
);

export const loadUniform = createAsyncThunk<UniformChecklist, string | undefined, { extra: DataDeps }>(
  'data/uniform',
  async (date, { extra }) => extra.repository.uniformChecklist(date),
);

export const toggleUniform = createAsyncThunk<
  UniformChecklist,
  { date: string; itemKey: string; checked: boolean },
  { extra: DataDeps }
>('data/toggleUniform', async ({ date, itemKey, checked }, { extra }) =>
  extra.repository.toggleUniform(date, itemKey, checked),
);

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    resetData: () => initialState,
  },
  extraReducers(builder) {
    builder
      .addCase(loadDashboard.pending, (state) => {
        state.dashboard.status = 'loading';
        state.dashboard.error = null;
      })
      .addCase(loadDashboard.fulfilled, (state, action) => {
        state.dashboard = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(loadDashboard.rejected, (state, action) => {
        state.dashboard = {
          data: state.dashboard.data,
          status: 'error',
          error: action.error.message ?? 'Gagal memuat dasbor.',
        };
      })
      .addCase(loadDuties.pending, (state) => {
        state.duties.status = 'loading';
        state.duties.error = null;
      })
      .addCase(loadDuties.fulfilled, (state, action) => {
        state.duties = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(loadDuties.rejected, (state, action) => {
        state.duties = { data: state.duties.data, status: 'error', error: describe(action.error) };
      })
      .addCase(completeDuty.fulfilled, (state, action) => {
        // Replace in place so the list keeps its order after completion.
        const index = state.duties.data.findIndex((duty) => duty.id === action.payload.id);
        if (index >= 0) state.duties.data[index] = action.payload;
      })
      .addCase(loadHomework.fulfilled, (state, action) => {
        state.homework = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(loadHomework.pending, (state) => {
        state.homework.status = 'loading';
      })
      .addCase(loadHomework.rejected, (state, action) => {
        state.homework = {
          data: state.homework.data,
          status: 'error',
          error: describe(action.error),
        };
      })
      .addCase(loadExams.fulfilled, (state, action) => {
        state.exams = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(loadExams.rejected, (state, action) => {
        state.exams = { data: state.exams.data, status: 'error', error: describe(action.error) };
      })
      .addCase(loadSubjects.fulfilled, (state, action) => {
        state.subjects = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(loadSubjects.rejected, (state, action) => {
        state.subjects = {
          data: state.subjects.data,
          status: 'error',
          error: describe(action.error),
        };
      })
      .addCase(loadUniform.fulfilled, (state, action) => {
        state.uniform = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(loadUniform.pending, (state) => {
        state.uniform.status = 'loading';
      })
      .addCase(loadUniform.rejected, (state, action) => {
        state.uniform = {
          data: state.uniform.data,
          status: 'error',
          error: describe(action.error),
        };
      })
      .addCase(toggleUniform.fulfilled, (state, action) => {
        state.uniform = { data: action.payload, status: 'ready', error: null };
      })
      .addCase(toggleUniform.rejected, (state, action) => {
        state.uniform.error = describe(action.error);
      });
  },
});

export const { resetData } = dataSlice.actions;
export const dataReducer = dataSlice.reducer;
