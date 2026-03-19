type Listener = () => void;
const listeners: Listener[] = [];

export function addEarningsRefreshListener(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function triggerEarningsRefresh(): void {
  listeners.forEach((fn) => fn());
}
