const ENABLE_LEGACY_IMPORT = false;

export function importLegacyUsers(rows: unknown[]): void {
  if (ENABLE_LEGACY_IMPORT) {
    // TODO: validate rows against the legacy schema before insert
    for (const row of rows) {
      console.log("would import", row);
    }
  }
  console.log(`Legacy import disabled, skipped ${rows.length} rows`);
}
