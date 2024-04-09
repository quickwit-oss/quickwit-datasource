import { configureStore } from "@reduxjs/toolkit";
import defaultsReducer from "./defaults"

export const store = configureStore({
  reducer: {
    defaults: defaultsReducer,
  }
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch
