export {};

// fvtt-types keys `game.settings.get/set` off this interface: a setting it doesn't know about is
// a type error, not an `any`. Declare each one your module registers — `"<module-id>.<key>"` —
// alongside the core settings you read.
declare module 'fvtt-types/configuration' {
  interface SettingConfig {
    // Foundry's own record of imported Adventures; unlisted upstream. Read by src/adventure.ts.
    'core.adventureImports': Record<string, boolean>;
  }
}
