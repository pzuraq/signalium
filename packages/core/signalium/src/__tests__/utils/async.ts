export const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
export const nextTick = () => sleep();
