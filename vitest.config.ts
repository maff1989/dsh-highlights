/**
 * Vitest configuration for the plugin.
 *
 * Two projects share one config:
 * - `node` runs the pure/unit suites (shared schema and position, host store
 *   and route, client data store) with no DOM globals, exactly like the Host.
 * - `ui` runs component suites under jsdom. Keeping the selector in one place
 *   means a new `tests/client/ui/*.spec.tsx` file needs no per-file
 *   environment docblock.
 *
 * The globs (not an explicit file list) are intentional: the UI component
 * suites are owned by separate workstreams and land independently, and a
 * project that currently matches nothing must not fail the run.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // @testing-library/react installs its automatic cleanup only when
    // `afterEach` is a global; `globals: true` keeps component suites tidy
    // without a shared setup file. Test files still import their APIs.
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.spec.ts'],
          exclude: ['tests/client/ui/**'],
        },
      },
      {
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['tests/client/ui/**/*.spec.{ts,tsx}'],
          environmentOptions: { jsdom: { url: 'http://localhost:3080/' } },
        },
      },
    ],
  },
})
