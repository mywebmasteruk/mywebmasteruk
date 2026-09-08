/**
 * Two functions and a tally.
 *
 * Separate from run.mjs so the test files can import it without a circular
 * top-level await — the runner awaits each test file, and a test file awaiting
 * the runner back deadlocks the process with no output at all.
 */
export const state = { passed: 0, failures: [], current: "" };

export function suite(name) {
  state.current = name;
  console.log(`\n${name}`);
}

export function check(description, condition) {
  if (condition) {
    state.passed++;
    console.log(`  ✓ ${description}`);
  } else {
    state.failures.push(`${state.current}: ${description}`);
    console.log(`  ✗ ${description}`);
  }
}
