# ⚠️ Required Update for Workflow 2A

## 🎯 What Needs to Change

Workflow 2A's "Create Final Summary" and "Trigger Workflow B" nodes need to be updated to pass `orderData` to Workflow 2B.

---

## 🔧 Update "Create Final Summary" Node

**Current code doesn't include orderData. Update to:**

```javascript
// Just process the incoming items (no history lookup)
const incomingItems = $input.all();

console.log('=== CREATE FINAL SUMMARY ===');
console.log(`Received ${incomingItems.length} items from loop`);

// Get original order data from upstream
const originalOrder = $('Generate Character Hash').first().json;

// Extract the data we need from incoming items
const submissions = incomingItems.map((item, idx) => {
  const j = item.json;
  return {
    requestId: j.requestId || null,
    statusUrl: j.statusUrl || null,
    poseNumber: idx + 1,  // 1-12 based on position
    characterHash: j.characterHash || 'nohash',
    characterPath: null,
    failed: !!j.failed,
    submittedAt: j.submittedAt || new Date().toISOString(),
  };
});

console.log(`Processed ${submissions.length} submissions`);
console.log(`Pose numbers: ${submissions.map(s => s.poseNumber).join(', ')}`);
console.log('===========================');

return [{
  json: {
    submissions: submissions,
    totalSubmissions: submissions.length,
    successful: submissions.filter(x => !x.failed && x.requestId && x.statusUrl).length,
    failed: submissions.filter(x => x.failed || !x.requestId || !x.statusUrl).length,
    submittedAt: new Date().toISOString(),
    // ADD ORDER DATA ✨
    orderData: {
      amazonOrderId: originalOrder.amazonOrderId,
      characterHash: originalOrder.characterHash,
      characterSpecs: originalOrder.characterSpecs,
      bookSpecs: originalOrder.bookSpecs,
      orderDetails: originalOrder.orderDetails
    }
  }
}];
```

---

## 🔧 Update "Trigger Workflow B" Node

**Change from:**
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://thepeakbeyond.app.n8n.cloud/webhook/bria-workflow-b",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "submissions",
          "value": "={{ $json.submissions }}"
        },
        {
          "name": "totalSubmissions",
          "value": "={{ $json.totalSubmissions }}"
        }
      ]
    }
  }
}
```

**To:**
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify($json) }}",
    "options": {}
  }
}
```

**Note:** Also update the webhook URL from `bria-workflow-b` to `bg-removal` to match the new 2B webhook.

---

## ✅ Expected Payload from 2A to 2B

After these changes, Workflow 2B will receive:

```json
{
  "submissions": [
    {
      "requestId": "...",
      "statusUrl": "...",
      "poseNumber": 1,
      "characterHash": "4892e96f1991d218",
      "failed": false
    }
    // ... 12 submissions
  ],
  "totalSubmissions": 12,
  "orderData": {
    "amazonOrderId": "TEST-ORDER-002",
    "characterHash": "4892e96f1991d218",
    "characterSpecs": {
      "childName": "Alex",
      "skinTone": "medium",
      "hairColor": "brown",
      ...
    },
    "bookSpecs": {...},
    "orderDetails": {...}
  }
}
```

---

## 🧪 Testing

1. Update 2A's two nodes as shown above
2. Run Workflow 2A
3. Check logs for: "✓ Order data present: TEST-ORDER-002"
4. Verify 2B receives and processes correctly

---

## 📝 Summary

**Changes needed in Workflow 2A:**
1. ✅ "Create Final Summary" - Add orderData to output
2. ✅ "Trigger Workflow B" - Change to JSON body and update URL

These changes ensure Workflow 2B has all the information it needs to:
- Organize files correctly by characterHash
- Pass complete data to Workflow 3
- Handle errors with proper context
