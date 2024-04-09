import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { defaultConfig , DefaultsConfigOverrides } from "./conf";
import _ from "lodash";

export const initialState = defaultConfig

const defaultsSlice = createSlice({
  name: "defaults",
  initialState: defaultConfig,
  reducers: {
    initDefaults(_s, action: PayloadAction<DefaultsConfigOverrides | undefined>) {
      // Initialize from default state, dont keep the old one
      let newState = _.cloneDeep(defaultConfig);
      // override values with payload
      if (action.payload) {
        const overrides = action.payload;
        for (const key in overrides) {
          // XXX : this is very not type-safe. Can do better ?
          const value = overrides[key];
          newState = _.set(newState, key, value);
        }
      }
      return newState
    }
  }
})

const {actions, reducer} = defaultsSlice
export const {
  initDefaults,
} = actions

export default reducer;
