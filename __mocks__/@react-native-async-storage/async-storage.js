// Root-level jest manual mock: jest auto-applies `__mocks__/<package>` for
// node_modules packages with no per-file `jest.mock()` call needed, so every
// test that transitively imports AsyncStorage (directly, or via `src/sync/
// seams/kv.ts` → `src/sync/engine.ts` → `src/sync/pushService.ts`) gets a
// working in-memory implementation without re-declaring the mock per file.
//
// Uses the package's own official jest mock rather than a hand-rolled one —
// it is a real, stateful in-memory store (getItem/setItem/removeItem actually
// round-trip), a superset of what the hand-written per-file mocks provided.
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock')
