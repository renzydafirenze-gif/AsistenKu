import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import type { Dashboard, Duty, Exam, Homework, Subject, UniformChecklist } from '../api/types';
import type {
  DutyInput,
  ExamInput,
  HomeworkInput,
  Repository,
  SubjectInput,
} from '../offline/repository';

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
  // Screens show their list right away, so start in `loading`: otherwise the
  // empty state flashes for one frame before the first read finishes.
  dashboard: { data: null, status: 'loading', error: null },
  duties: { data: [], status: 'loading', error: null },
  homework: { data: [], status: 'loading', error: null },
  exams: { data: [], status: 'loading', error: null },
  subjects: { data: [], status: 'loading', error: null },
  uniform: { data: null, status: 'loading', error: null },
};

interface DataDeps {
  repository: Repository;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Gagal menyimpan data.';
}

interface Snapshot {
  dashboard: Dashboard;
  duties: Duty[];
  homework: Homework[];
  exams: Exam[];
  subjects: Subject[];
  uniform: UniformChecklist;
}

/**
 * The whole dataset is small and local, so every mutation reloads it once
 * instead of patching six slices by hand. Screens therefore never show stale
 * cross-resource numbers (e.g. dashboard PR counts after submitting work).
 */
export const refreshAll = createAsyncThunk<Snapshot, void, { extra: DataDeps }>(
  'data/refreshAll',
  async (_arg, { extra }) => {
    const [dashboard, duties, homework, exams, subjects, uniform] = await Promise.all([
      extra.repository.dashboard(),
      extra.repository.duties(),
      extra.repository.homework(),
      extra.repository.exams(),
      extra.repository.subjects(),
      extra.repository.uniformChecklist(),
    ]);
    return {
      dashboard,
      duties: duties.items,
      homework: homework.items,
      exams: exams.items,
      subjects: subjects.items,
      uniform,
    };
  },
);

type MutationApi = {
  extra: DataDeps;
  dispatch: (action: unknown) => unknown;
};

/** Runs a local mutation, then reloads every resource exactly once. */
function mutation<Result, Arg = void>(
  name: string,
  run: (repository: Repository, arg: Arg) => Promise<Result>,
) {
  return createAsyncThunk<Result, Arg, MutationApi>(name, async (arg, { extra, dispatch }) => {
    const result = await run(extra.repository, arg);
    await dispatch(refreshAll());
    return result;
  });
}

export const saveDuty = mutation('data/saveDuty', (repository, arg: { input: DutyInput; id?: string }) =>
  repository.saveDuty(arg.input, arg.id),
);
export const completeDuty = mutation('data/completeDuty', (repository, id: string) =>
  repository.completeDuty(id),
);
export const removeDuty = mutation('data/removeDuty', (repository, id: string) =>
  repository.removeDuty(id),
);

export const saveHomework = mutation(
  'data/saveHomework',
  (repository, arg: { input: HomeworkInput; id?: string }) =>
    repository.saveHomework(arg.input, arg.id),
);
export const completeHomework = mutation('data/completeHomework', (repository, id: string) =>
  repository.completeHomework(id),
);
export const removeHomework = mutation('data/removeHomework', (repository, id: string) =>
  repository.removeHomework(id),
);

export const saveExam = mutation('data/saveExam', (repository, arg: { input: ExamInput; id?: string }) =>
  repository.saveExam(arg.input, arg.id),
);
export const publishExam = mutation('data/publishExam', (repository, id: string) =>
  repository.publishExam(id),
);
export const removeExam = mutation('data/removeExam', (repository, id: string) =>
  repository.removeExam(id),
);

export const saveSubject = mutation(
  'data/saveSubject',
  (repository, arg: { input: SubjectInput; id?: string }) =>
    repository.saveSubject(arg.input, arg.id),
);
export const removeSubject = mutation('data/removeSubject', (repository, id: string) =>
  repository.removeSubject(id),
);

export const toggleUniform = mutation(
  'data/toggleUniform',
  (repository, arg: { date: string; itemKey: string; checked: boolean }) =>
    repository.toggleUniform(arg.date, arg.itemKey, arg.checked),
);

export const updateProfile = mutation('data/updateProfile', (repository, name: string) =>
  repository.updateProfile(name),
);
export const clearAll = mutation('data/clearAll', (repository) => repository.clearAll());
export const loadDemo = mutation('data/loadDemo', (repository) => repository.loadDemo());

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(refreshAll.pending, (state) => {
        (
          ['dashboard', 'duties', 'homework', 'exams', 'subjects', 'uniform'] as const
        ).forEach((key) => {
          state[key].status = 'loading';
        });
      })
      .addCase(refreshAll.fulfilled, (state, action) => {
        const { dashboard, duties, homework, exams, subjects, uniform } = action.payload;
        state.dashboard = { data: dashboard, status: 'ready', error: null };
        state.duties = { data: duties, status: 'ready', error: null };
        state.homework = { data: homework, status: 'ready', error: null };
        state.exams = { data: exams, status: 'ready', error: null };
        state.subjects = { data: subjects, status: 'ready', error: null };
        state.uniform = { data: uniform, status: 'ready', error: null };
      })
      .addCase(refreshAll.rejected, (state, action) => {
        const message = action.error.message ?? describe(action.error);
        state.dashboard = { ...state.dashboard, status: 'error', error: message };
        state.duties = { ...state.duties, status: 'error', error: message };
        state.homework = { ...state.homework, status: 'error', error: message };
        state.exams = { ...state.exams, status: 'error', error: message };
        state.subjects = { ...state.subjects, status: 'error', error: message };
        state.uniform = { ...state.uniform, status: 'error', error: message };
      });
  },
});

export const dataReducer = dataSlice.reducer;
