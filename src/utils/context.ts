import { Context,  useContext } from 'react';


interface GetHook {
  <T>(context: Context<T>): () => NonNullable<T>;
}

export const getHook: GetHook = (c) => () => {
  const contextValue = useContext(c);

  if (!contextValue) {
    throw new Error(`use context first.`);
  }

  return contextValue as NonNullable<typeof contextValue>;
};

