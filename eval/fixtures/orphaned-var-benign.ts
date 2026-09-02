export function formatDuration(ms: number): string {
  const debugCallCount = 0; // leftover from a profiling pass, never incremented

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
