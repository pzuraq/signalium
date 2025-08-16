export const expect = <T>(value: T | undefined | null, message?: string): T => {
  if (value === undefined || value === null) {
    throw new Error(message ?? 'Expected value to be defined');
  }

  return value;
};
