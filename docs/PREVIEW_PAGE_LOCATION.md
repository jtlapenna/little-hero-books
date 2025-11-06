# Preview Page Location & Migration Plan

## Current Status

**Location**: `frontend/src/pages/approve/[token].astro` (Customer-facing site - Astro)  
**Status**: ✅ **MOVED TO CUSTOMER-FACING SITE** - Placeholder implementation complete (Admin copy removed)

## Why This Needs to Move

1. **Customer-Facing Site**: Preview page should be on `littleherolabs.com` (customer-facing site)
2. **Admin Site**: `admin.littleherolabs.com` is for internal use only - not branded for customers
3. **Proper Branding**: Customer-facing site has proper branding, styling, and customer experience
4. **Security**: Admin site should not be accessible to customers

## Target Location

**Frontend Site**: `frontend/src/pages/approve/[token].astro` (Astro)

## Migration Plan

### Phase 1: Current (Placeholder) ✅ COMPLETE
- Preview page in `frontend/src/pages/approve/[token].astro` (Customer-facing site)
- Converted from React/Next.js to Astro
- Standalone layout (header/footer hidden for secure link)
- Customer-friendly styling matching brand
- API endpoints call back-end at `http://localhost:3000/api/preview/*`
- Token validation and approval flow working
- Admin preview page removed from `back-end` (`src/app/approve/[token]/*` deleted)

### Phase 3: Full Implementation (After Developer A)
1. Clone Developer A's PDF previewer
2. Integrate into Astro page
3. Add full PDF viewing capabilities
4. Complete customer experience

## API Endpoints

The API endpoints can stay in the `back-end` directory since they're server-side:
- `/api/preview/validate-token` ✅
- `/api/preview/generate-token` ✅
- `/api/preview/[orderId]/approve` ✅
- `/api/preview/[orderId]/reject` ✅

These can be called from either the admin site or customer-facing site.

## Current URL Structure

**Customer-Facing Site** (current):
- `littleherolabs.com/approve/[token]` (or `localhost:4321/approve/[token]`)

**API Endpoints** (back-end):
- `admin.littleherolabs.com/api/preview/*` (or `localhost:3000/api/preview/*`)
- Generate token now returns a customer-facing URL using `CUSTOMER_SITE_URL` (defaults to `http://localhost:4321`).

## Notes

- ✅ The preview page has been moved to the customer-facing site
- ✅ It's fully functional and ready for testing
- ✅ API endpoints remain in back-end (location-agnostic)
- ✅ Page is accessible at `localhost:4321/approve/[token]` (customer-facing site)
- ⏳ Full PDF previewer will be integrated after Developer A completes admin previewer
- 🔒 Tokens are still single-use and expire after 3 days; no static pages are generated.

