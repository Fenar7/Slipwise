/**
 * Phase 29: Tagging Platform — Migration Compatibility
 *
 * COMPATIBILITY STANCE (Phase 1):
 *
 * Existing raw tag arrays on Customer and Vendor models (`tags: String[]`)
 * are **NOT modified or migrated** in Phase 1. They continue to function as
 * before for backward compatibility. The new DocumentTag system operates
 * independently alongside them.
 *
 * Migration strategy:
 * - Phase 1: DocumentTag + assignment tables coexist with legacy String[] tags
 * - Phase 2+: When tag picker UI is ready, customers/vendors can adopt DocumentTag defaults
 * - Phase 4: Optional migration script to convert legacy String[] tags to DocumentTag records
 * - Phase 5: Legacy tag arrays may be deprecated after full adoption
 *
 * IMPLEMENTATION NOTE (Phase 1.3 decision):
 * Tag-aware vault filtering uses **relational join filtering** rather than
 * denormalized tag names in the DocumentIndex table. Rationale:
 *   1. Keeps DocumentIndex schema stable (no migration needed)
 *   2. Avoids touching every document sync point for tag propagation
 *   3. Tag assignments are always real-time via join tables
 *   4. Source-of-truth remains the assignment tables, not the index
 *   5. Query performance is adequate for Phase 1 volumes
 *
 * Post-Phase-5 optimization option:
 * If tag filtering at scale becomes slow, denormalize tag names into
 * DocumentIndex as an indexed text array field and maintain via sync hooks.
 */

export function getTaggingCompatibilityNote(): string {
  return "Legacy customer/vendor `tags: String[]` arrays are preserved. Use DocumentTag for the new tagging system.";
}
