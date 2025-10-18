# Development Plan: Human-in-the-Loop Asset Review System

## Phase 1: Local Development Setup (Week 1) ✅ COMPLETED

### 1.1 Project Structure ✅
- [x] Create Next.js application in `/back-end/` directory
- [x] Set up TypeScript configuration
- [x] Configure Tailwind CSS for styling
- [x] Set up project structure with components, pages, and API routes

### 1.2 Mock Data & Development Environment ✅
- [x] Create mock order data structure
- [x] Build mock asset data for all 3 stages
- [x] Set up local development server
- [x] Create sample order.json files for testing

### 1.3 Core UI Components ✅
- [x] **Orders Index Page**
  - Table with order listing
  - Search and filter functionality
  - Status indicators and badges
  - Responsive design

- [x] **Order Detail Page**
  - Customer information display
  - Stage status overview
  - Navigation between stages
  - Asset grid layout

- [x] **Asset Preview Modal**
  - High-quality image preview
  - Zoom and pan functionality
  - Download and replace actions
  - Keyboard navigation

### 1.4 Basic State Management ✅
- [x] Order data fetching and caching
- [x] Stage selection and navigation
- [x] Asset preview state management
- [x] Approval/rejection state tracking

## Phase 2: R2 Integration (Week 2) ✅ COMPLETED

### 2.1 R2 SDK Setup ✅
- [x] Install and configure AWS SDK for R2
- [x] Set up environment variables
- [x] Create R2 client configuration
- [x] Test connection and permissions

### 2.2 API Endpoints ✅
- [x] **GET /api/orders** - List orders with pagination
- [x] **GET /api/orders/[orderId]** - Get order details
- [x] **GET /api/list** - List assets by stage
- [x] **POST /api/presign-put** - Generate signed PUT URLs
- [x] **POST /api/approve** - Approve stage and trigger webhook

### 2.3 Asset Management ✅
- [x] List assets from R2 by prefix and stage
- [x] Generate signed GET URLs for preview
- [x] Generate signed PUT URLs for replacement
- [x] Handle file uploads and replacements

### 2.4 Error Handling ✅
- [x] R2 connection error handling
- [x] Signed URL expiration handling
- [x] File upload error recovery
- [x] User-friendly error messages

## Phase 3: V1 Core Features (Week 3-4)

### 3.1 Authentication & Security
- [ ] User authentication system
- [ ] Role-based access control (reviewer vs admin)
- [ ] Session management and security headers
- [ ] API rate limiting and request validation

### 3.2 Database Integration
- [ ] Replace file-based approval store with database
- [ ] Order status persistence across restarts
- [ ] Data backup and recovery procedures
- [ ] Database indexing for search performance

### 3.3 Error Handling & Monitoring ✅ COMPLETED
- [x] Comprehensive error logging (server/client)
- [x] Error notification system (email alerts) - *Basic structure in place*
- [x] Health check endpoints for monitoring
- [x] Graceful degradation when services unavailable
- [x] Real-time monitoring dashboard
- [x] Error management API endpoints
- [x] Service health checks (R2, n8n, Database, File System)
- [x] Performance metrics tracking

### 3.4 Order History & Audit Trail
- [ ] Track all approval/rejection actions
- [ ] Reviewer activity logs
- [ ] Order status change history
- [ ] Timestamp tracking for all actions

## Phase 4: V1 Integration & Workflow (Week 5-6)

### 4.1 Email Notifications
- [ ] Order status change notifications
- [ ] Approval/rejection alerts
- [ ] System error notifications

### 4.2 Asset Validation
- [ ] File type validation (PNG/JPG only)
- [ ] File size limits (prevent oversized uploads)
- [ ] Image dimension validation
- [ ] Format consistency checks

### 4.3 Order Processing Queue
- [ ] Manage orders waiting to be processed
- [ ] Ensure proper order handling sequence
- [ ] Persist queue state across restarts

### 4.4 n8n Integration
- [ ] Set up n8n webhook endpoints
- [ ] Configure stage-specific routing
- [ ] Implement webhook payload structure
- [ ] Stage approval logic and webhook triggering

## Phase 5: V1.1 Performance & Polish (Week 7-8)

### 5.1 Performance Optimization
- [ ] Webhook retry logic with exponential backoff
- [ ] Image optimization and caching
- [ ] CDN integration for asset delivery
- [ ] Lazy loading for large asset grids

### 5.2 Quality Assurance
- [ ] Automated testing suite (unit, integration, e2e)
- [ ] Health check endpoints
- [ ] Performance metrics and monitoring

### 5.3 Enhanced UI/UX
- [ ] Toast notifications for user feedback
- [ ] Loading states and progress indicators
- [ ] Keyboard shortcuts for power users
- [ ] Success/error confirmation dialogs

## Phase 6: Testing & Deployment (Week 9)

### 6.1 Testing
- [ ] Unit tests for components
- [ ] Integration tests for API
- [ ] End-to-end testing
- [ ] User acceptance testing

### 6.2 Deployment Preparation
- [ ] Environment configuration
- [ ] Production build optimization
- [ ] Security hardening
- [ ] Documentation updates

### 6.3 Go-Live
- [ ] Deploy to staging environment
- [ ] Final testing with real data
- [ ] Production deployment
- [ ] Monitor and support

## Technical Stack

### Frontend
- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context + useReducer
- **HTTP Client**: Fetch API with SWR for caching

### Backend
- **API**: Next.js API Routes
- **Storage**: Cloudflare R2 (S3-compatible)
- **Authentication**: NextAuth.js
- **Validation**: Zod schemas

### Development Tools
- **Package Manager**: npm
- **Linting**: ESLint + Prettier
- **Testing**: Jest + React Testing Library
- **Type Checking**: TypeScript strict mode

## File Structure

```
back-end/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── orders/
│   │   │   ├── list/
│   │   │   ├── presign-put/
│   │   │   └── approve/
│   │   ├── orders/
│   │   │   └── [orderId]/
│   │   └── review/
│   ├── components/
│   │   ├── ui/
│   │   ├── orders/
│   │   └── assets/
│   ├── lib/
│   │   ├── r2.ts
│   │   ├── auth.ts
│   │   └── utils.ts
│   └── types/
│       ├── order.ts
│       ├── asset.ts
│       └── api.ts
├── public/
├── docs/
└── tests/
```

## Success Criteria

- [ ] Human reviewers can efficiently review assets at all 3 stages
- [ ] Assets can be replaced and approved without manual R2 access
- [ ] n8n workflows are triggered correctly on approval
- [ ] System handles errors gracefully
- [ ] UI is intuitive and responsive
- [ ] Performance is acceptable for production use

