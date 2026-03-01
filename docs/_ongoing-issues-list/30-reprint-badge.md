# Reprint Tracking

Add a reprint_count column (or increment existing revision_count) when regenerating

Add a reprint_note or reprint_reason field (set via UI or auto-populated)

Orders restored from archive or regenerated from delivered state automatically appear in the active orders table (the fix above already does this via lifecycle_status: 'active')

Optionally add a "Reprint" badge in the admin UI when reprint_count > 0