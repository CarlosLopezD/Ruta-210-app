// Runs once before every test file: extends Vitest's `expect` with jest-dom's
// matchers (toBeInTheDocument, toHaveTextContent, etc.).
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// We don't run with `test.globals: true` (avoids a tsconfig types change
// just for tests), so Testing Library's auto-cleanup — which only wires
// itself up when it finds a global `afterEach` — never registers on its
// own. Without this, each test's rendered modal would stay in the DOM for
// the next test, breaking any query that expects a single match.
afterEach(() => {
  cleanup();
});
