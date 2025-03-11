export const unreachable = (value: never) => {
  throw new Error(`Unreachable code: ${value}`);
};
