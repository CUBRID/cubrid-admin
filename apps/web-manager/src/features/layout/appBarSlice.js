import { createSlice } from '@reduxjs/toolkit';

const closedUpdateCheck = { isOpen: false, source: 'manual', preloadedStatus: null };

const initialState = {
  isAboutCubridOpen: false,
  updateCheck: closedUpdateCheck,
};

const appBarSlice = createSlice({
  name: 'appBar',
  initialState,
  reducers: {
    setAboutCubrid: (state, action) => {
      state.isAboutCubridOpen = action.payload;
    },
    // payload: { source: 'manual' | 'startup', preloadedStatus?: UpdateStatus }
    openUpdateCheck: (state, action) => {
      const source = action.payload?.source === 'startup' ? 'startup' : 'manual';
      // A startup notice that lands while the user already has the modal
      // open (e.g. they clicked the menu first) must not replace it.
      if (source === 'startup' && state.updateCheck.isOpen) {
        return;
      }
      state.updateCheck = {
        isOpen: true,
        source,
        preloadedStatus: action.payload?.preloadedStatus ?? null,
      };
    },
    closeUpdateCheck: (state) => {
      state.updateCheck = closedUpdateCheck;
    },
  },
});

export const { setAboutCubrid, openUpdateCheck, closeUpdateCheck } = appBarSlice.actions;
export default appBarSlice.reducer;
