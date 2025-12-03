# RBI Technical Integration Details

**Technical specifications and implementation details for RBI integration**

---

## RBI Service Architecture

### Service Overview
- **Name:** RBI Architecture Service (RBI-Kernel)
- **Version:** 2.0.0
- **Type:** REST API Service
- **Default Port:** 3001
- **Repository:** https://github.com/GgStardust/rbi-architecture-service

### 5-Layer Architecture

1. **Representation Layer**
   - Input processing and metadata extraction
   - Content normalization
   - Format conversion

2. **Computation Layer**
   - Resonance calculation
   - Coherence scoring
   - Vector operations

3. **Temporal Layer**
   - Stability tracking
   - Continuity validation
   - Temporal coherence

4. **Validation Layer**
   - Proof-of-Meaning verification
   - Sovereign logic validation
   - Coherence verification

5. **Interfaces Layer**
   - REST API endpoints
   - Formatted output
   - Error handling

---

## API Endpoints

### Health Check
```
GET /health
Response: { "status": "healthy", "service": "rbi-kernel", "version": "2.0.0" }
```

### Score Content
```
POST /field/score
Request: { "content": "Text content to analyze" }
Response: {
  "clarity": 0.8,
  "coherence": 0.9,
  "resonance": 0.85,
  "sovereignty": 0.8,
  "fieldDynamics": { "fieldStrength": 2.1, "stability": 0.9, "coherence": 0.85 }
}
```

### Validate Content
```
POST /field/validate
Request: { "content": "Content to validate", "categoryAssociations": [1, 2, 3] }
Response: {
  "verified": true,
  "confidence": 0.875,
  "mathematicalProof": "proof_serialization_string",
  "resonanceVector": { "x": 0.8, "y": 0.9, "z": 0.85, "w": 0.8 },
  "sovereignLogic": { "validity": "proven", "coherence": 0.85, "sovereignty": 0.8 }
}
```

### Find Neighbors (Similarity Search)
```
POST /field/neighbors
Request: {
  "query": { "text": "Query text" },
  "candidates": [{ "id": "item1", "text": "Candidate text" }],
  "topN": 5
}
Response: {
  "neighbors": [{ "id": "item1", "score": 0.95 }],
  "count": 1,
  "topN": 5
}
```

### Full Analysis
```
POST /field/analyze
Request: { "content": "Content to analyze", "title": "Optional title" }
Response: {
  "overallScore": 0.88,
  "signature": { "clarity": 0.85, "coherence": 0.92, "resonance": 0.88, "sovereignty": 0.90 },
  "resonanceVector": { "x": 0.85, "y": 0.92, "z": 0.88, "w": 0.90 },
  "harmonicFrequency": 0.89,
  "coherenceMatrix": { "rank": 4, "size": 4, "eigenvalues": [0.92, 0.88, 0.85, 0.90] },
  "fieldDynamics": { "fieldStrength": 2.15, "stability": 0.91, "coherence": 0.90 },
  "sovereignLogic": { "validity": "proven", "coherence": 0.90, "sovereignty": 0.90 }
}
```

---

## Integration Code Examples

### Backend Service (TypeScript)

```typescript
// back-end/src/lib/rbi-service.ts
import axios from 'axios';

const RBI_SERVICE_URL = process.env.RBI_SERVICE_URL || 'http://localhost:3001';

export async function validateOrder(order: any) {
  const response = await axios.post(`${RBI_SERVICE_URL}/field/validate`, {
    content: JSON.stringify(order),
    categoryAssociations: [1, 2, 3]
  });
  
  return {
    verified: response.data.verified,
    confidence: response.data.confidence,
    validity: response.data.sovereignLogic.validity,
    coherence: response.data.sovereignLogic.coherence
  };
}

export async function scoreQuality(content: string) {
  const response = await axios.post(`${RBI_SERVICE_URL}/field/score`, {
    content
  });
  
  return {
    clarity: response.data.clarity,
    coherence: response.data.coherence,
    resonance: response.data.resonance,
    sovereignty: response.data.sovereignty,
    overallScore: (
      response.data.clarity + 
      response.data.coherence + 
      response.data.resonance + 
      response.data.sovereignty
    ) / 4
  };
}

export async function findSimilarOrders(queryOrder: any, candidateOrders: any[]) {
  const response = await axios.post(`${RBI_SERVICE_URL}/field/neighbors`, {
    query: { text: JSON.stringify(queryOrder) },
    candidates: candidateOrders.map(order => ({
      id: order.id,
      text: JSON.stringify(order)
    })),
    topN: 5
  });
  
  return response.data.neighbors;
}

export async function analyzeOrder(order: any) {
  const response = await axios.post(`${RBI_SERVICE_URL}/field/analyze`, {
    content: JSON.stringify(order)
  });
  
  return {
    overallScore: response.data.overallScore,
    signature: response.data.signature,
    fieldDynamics: response.data.fieldDynamics,
    sovereignLogic: response.data.sovereignLogic
  };
}
```

### n8n Workflow Integration

```json
{
  "parameters": {
    "method": "POST",
    "url": "http://localhost:3001/field/validate",
    "authentication": "none",
    "sendBody": true,
    "contentType": "json",
    "bodyParameters": {
      "parameters": [
        {
          "name": "content",
          "value": "={{ JSON.stringify($json.order) }}"
        },
        {
          "name": "categoryAssociations",
          "value": "=[1, 2, 3]"
        }
      ]
    }
  },
  "name": "RBI Validate Order",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 1
}
```

---

## Environment Configuration

### Environment Variables
```bash
# RBI Architecture Service
RBI_SERVICE_URL=http://localhost:3001

# For production (optional)
RBI_API_KEY=your-api-key-here
```

### Service Setup
```bash
# Clone RBI-Kernel repository
git clone https://github.com/GgStardust/rbi-kernel.git
cd rbi-kernel
npm install
npm run dev  # Runs on http://localhost:3001
```

### Production Deployment Options

**Option 1: Same Server**
- Run RBI service on same server as Little Hero Books backend
- Use `http://localhost:3001` or `http://127.0.0.1:3001`

**Option 2: Separate Service**
- Deploy RBI service separately
- Update `RBI_SERVICE_URL` in environment variables
- Use full URL: `http://rbi-service.example.com:3001`

**Option 3: Docker**
```bash
cd rbi-kernel
docker build -t rbi-kernel:2.0.0 .
docker run -p 3001:3001 rbi-kernel:2.0.0
```

---

## Error Handling

### Fallback Strategy
```typescript
try {
  const response = await axios.post(`${RBI_SERVICE_URL}/field/validate`, {
    content: JSON.stringify(order)
  });
  
  return response.data;
} catch (error: any) {
  if (error.response) {
    // API error
    console.error('RBI API error:', error.response.data);
    return { error: error.response.data.error || 'Validation failed' };
  } else if (error.request) {
    // Network error - fallback to allow processing
    console.error('RBI service unavailable');
    return { verified: true, fallback: true };
  } else {
    // Other error
    console.error('Error:', error.message);
    return { error: 'Unknown error' };
  }
}
```

### Service Health Monitoring
```typescript
async function checkRBIHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${RBI_SERVICE_URL}/health`);
    return response.data.status === 'healthy';
  } catch {
    return false;
  }
}
```

---

## Performance Characteristics

### Response Times
- **Score:** <50ms average
- **Validate:** <100ms average
- **Neighbors:** <150ms average (depends on candidate count)
- **Analyze:** <200ms average

### Throughput
- **Rate Limit:** 100 requests per window (configurable)
- **Concurrent Requests:** Supports multiple simultaneous requests
- **Scalability:** Can be horizontally scaled

### Resource Usage
- **Memory:** ~100MB base + ~10MB per active request
- **CPU:** Low (mathematical computations are efficient)
- **Network:** Minimal (small request/response payloads)

---

## Security Considerations

### Authentication (Optional)
- API key authentication available for production
- Header: `x-api-key: your-api-key-here`
- Or: `Authorization: Bearer your-api-key-here`

### Rate Limiting
- Default: 100 requests per window
- Configurable via environment variables
- Prevents abuse and ensures fair usage

### Data Privacy
- No data storage (stateless service)
- All processing is in-memory
- No logging of sensitive content (configurable)

---

## Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### Test Validation
```bash
curl -X POST http://localhost:3001/field/validate \
  -H "Content-Type: application/json" \
  -d '{"content": "Test order validation"}'
```

### Test Scoring
```bash
curl -X POST http://localhost:3001/field/score \
  -H "Content-Type: application/json" \
  -d '{"content": "Test quality scoring"}'
```

### Test Similarity
```bash
curl -X POST http://localhost:3001/field/neighbors \
  -H "Content-Type: application/json" \
  -d '{
    "query": { "text": "Test query" },
    "candidates": [
      { "id": "1", "text": "Test candidate 1" },
      { "id": "2", "text": "Test candidate 2" }
    ],
    "topN": 2
  }'
```

---

## Integration Checklist

### Setup
- [ ] Clone RBI-Kernel repository
- [ ] Install dependencies (`npm install`)
- [ ] Start service (`npm run dev`)
- [ ] Verify health endpoint
- [ ] Test API endpoints

### Backend Integration
- [ ] Create `rbi-service.ts` file
- [ ] Add environment variables
- [ ] Implement validation functions
- [ ] Add error handling
- [ ] Test integration

### n8n Integration
- [ ] Add HTTP Request nodes to workflows
- [ ] Configure endpoint URLs
- [ ] Test workflow integration
- [ ] Add error handling nodes

### Testing
- [ ] Test with sample orders
- [ ] Verify response formats
- [ ] Test error scenarios
- [ ] Measure performance
- [ ] Validate cost savings

### Production
- [ ] Deploy RBI service
- [ ] Update environment variables
- [ ] Configure authentication (if needed)
- [ ] Set up monitoring
- [ ] Document deployment

---

## Support Resources

- **Repository:** https://github.com/GgStardust/rbi-architecture-service
- **Documentation:** See `docs/` directory in repository
- **Examples:** See `examples/little-hero-books/` directory
- **API Reference:** See `openapi.yaml` in repository

---

**Technical Details Complete**  
**Ready for Implementation**

