# Human Review Implementation Guide - Little Hero Books

## 🎯 **Overview**

The human review step is a **quality control checkpoint** between Workflow 3 (Book Assembly) and Workflow 4 (Print & Fulfillment). It ensures every book meets quality standards before being sent to print.

## 🔄 **Complete Flow**

```
Workflow 3 (Book Assembly)
    ↓
    Generates PDF + Cover
    ↓
    Calculates Quality Score (0-1)
    ↓
    IF quality_score < 0.8 OR priority = 'high'
        ↓
        requires_human_review = TRUE
        status = 'book_assembly_completed'
        human_approved = NULL
        ↓
        Add to human_review_queue table
        ↓
        Send notification to reviewer
        ↓
        [PAUSE - Waiting for Human Action]
        ↓
    Human Reviewer Reviews Book
        ↓
        Option 1: APPROVE
            ↓
            human_approved = TRUE
            Remove from human_review_queue
            ↓
            Workflow 4 picks up order
        ↓
        Option 2: REJECT (with feedback)
            ↓
            human_approved = FALSE
            qa_notes = 'Detailed rejection reason'
            regeneration_instructions = 'Specific changes needed'
            regeneration_attempt = regeneration_attempt + 1
            status = 'ai_generation_required'
            next_workflow = '2.A.-bria-submit'
            ↓
            Order goes back to Workflow 2A WITH FEEDBACK
    ↓
    ELSE (quality_score >= 0.8)
        ↓
        requires_human_review = FALSE
        human_approved = TRUE (auto-approved)
        status = 'book_assembly_completed'
        ↓
        Workflow 4 picks up order immediately
```

## 🔄 **Feedback-Driven Regeneration System**

### **The Problem**
Without feedback, rejected orders would be regenerated with the same prompt and likely produce the same poor result. We need a **feedback loop** to guide the AI toward better results.

### **The Solution**
When a reviewer rejects an order, they provide **specific feedback** that gets incorporated into the regeneration prompt, helping the AI understand what went wrong and how to fix it.

### **Database Schema for Feedback**

Add these fields to the `orders` table:
```sql
-- Regeneration tracking
regeneration_attempt INTEGER DEFAULT 0,
regeneration_instructions TEXT,
qa_notes TEXT,
previous_character_images JSONB, -- Store URLs of rejected images
rejection_history JSONB DEFAULT '[]'::jsonb,

-- Quality issue categorization
quality_issues JSONB DEFAULT '[]'::jsonb
```

### **Rejection Categories**

When rejecting, reviewers select from predefined categories:

| Category | Description | AI Adjustment |
|----------|-------------|---------------|
| **Character Inconsistency** | Character looks different across pages | Increase consistency weight, use reference image |
| **Wrong Skin Tone** | Skin tone doesn't match specs | Adjust skin tone in prompt, increase emphasis |
| **Wrong Hair Color/Style** | Hair doesn't match specs | Adjust hair description, add more detail |
| **Wrong Age Appearance** | Character looks too old/young | Adjust age descriptors in prompt |
| **Wrong Clothing** | Clothing doesn't match style | Update clothing description |
| **Poor Image Quality** | Blurry, pixelated, artifacts | Increase quality parameters, try different seed |
| **Background Issues** | Background removal problems | Adjust background removal settings |
| **Pose Problems** | Character pose doesn't fit scene | Adjust pose instructions |
| **Other** | Custom feedback | Use reviewer's custom instructions |

### **Feedback Flow**

```
Reviewer Rejects Order
    ↓
Selects rejection category (or multiple)
    ↓
Adds specific notes (optional but recommended)
    ↓
System generates regeneration_instructions
    ↓
Example:
  Category: "Wrong Hair Color"
  Notes: "Hair is blonde but should be brown"
  
  Generated Instructions:
  "CRITICAL: Hair color MUST be dark brown, not blonde.
   Previous attempt had blonde hair which was incorrect.
   Emphasize brown hair color in all poses.
   Reference: Child has dark brown hair, shoulder-length, wavy."
    ↓
Workflow 2A reads regeneration_instructions
    ↓
Modifies AI prompt to incorporate feedback
    ↓
Generates new character with corrections
```

### **Workflow 2A Integration**

**Current Workflow 2A** (Developer A needs to add this):

```javascript
// At the start of Workflow 2A
const order = await getOrderFromDatabase(orderId);

// Check if this is a regeneration
if (order.regeneration_attempt > 0) {
  console.log(`🔄 Regeneration attempt ${order.regeneration_attempt} for order ${order.amazon_order_id}`);
  console.log(`📝 Feedback: ${order.regeneration_instructions}`);
  
  // Build enhanced prompt with feedback
  const basePrompt = generateCharacterPrompt(order.character_specs);
  const enhancedPrompt = `${basePrompt}

IMPORTANT CORRECTIONS FROM PREVIOUS ATTEMPT:
${order.regeneration_instructions}

PREVIOUS ISSUES TO AVOID:
${order.quality_issues.map(issue => `- ${issue.category}: ${issue.description}`).join('\n')}

Please ensure these corrections are applied to ALL character poses.`;

  // Use enhanced prompt for AI generation
  const aiResponse = await generateCharacterWithBria({
    prompt: enhancedPrompt,
    characterSpecs: order.character_specs,
    previousAttempt: order.regeneration_attempt,
    // Optionally: use different seed or parameters
    seed: Date.now(), // New seed for different result
    qualityBoost: true // Increase quality settings
  });
  
} else {
  // First attempt - use standard prompt
  const prompt = generateCharacterPrompt(order.character_specs);
  const aiResponse = await generateCharacterWithBria({
    prompt,
    characterSpecs: order.character_specs
  });
}
```

### **Rejection Interface Requirements**

The review dashboard should include:

1. **Rejection Reason Checkboxes**:
   ```html
   <div class="rejection-reasons">
     <h3>What needs to be fixed?</h3>
     <label><input type="checkbox" value="character_inconsistency"> Character looks different across pages</label>
     <label><input type="checkbox" value="wrong_skin_tone"> Skin tone doesn't match</label>
     <label><input type="checkbox" value="wrong_hair"> Hair color/style doesn't match</label>
     <label><input type="checkbox" value="wrong_age"> Character looks wrong age</label>
     <label><input type="checkbox" value="wrong_clothing"> Clothing doesn't match</label>
     <label><input type="checkbox" value="poor_quality"> Poor image quality</label>
     <label><input type="checkbox" value="background_issues"> Background removal problems</label>
     <label><input type="checkbox" value="pose_problems"> Pose doesn't fit scene</label>
     <label><input type="checkbox" value="other"> Other (specify below)</label>
   </div>
   ```

2. **Specific Instructions Field**:
   ```html
   <div class="specific-instructions">
     <h3>Specific instructions for regeneration:</h3>
     <textarea name="regeneration_instructions" rows="4" placeholder="Be specific about what needs to change. Example: 'Hair should be darker brown, almost black. Current hair is too light.'"></textarea>
   </div>
   ```

3. **Side-by-Side Comparison** (for regenerations):
   ```html
   <div class="comparison-view">
     <div class="previous-attempt">
       <h4>Previous Attempt (Rejected)</h4>
       <img src="previous_character_url" />
       <p>Rejection reason: {{ previous_qa_notes }}</p>
     </div>
     <div class="current-attempt">
       <h4>Current Attempt</h4>
       <img src="current_character_url" />
     </div>
   </div>
   ```

### **Auto-Generated Feedback Templates**

Based on selected categories, auto-generate detailed instructions:

```javascript
const feedbackTemplates = {
  character_inconsistency: `CRITICAL: Character appearance must be EXACTLY the same across all 12 poses.
    - Same face shape and features
    - Same skin tone (no variation)
    - Same hair color and style
    - Same clothing
    Use the same base character model for all poses.`,
  
  wrong_skin_tone: `CRITICAL: Skin tone is incorrect.
    Required: ${order.character_specs.skinTone}
    Previous attempt had: [reviewer notes]
    Ensure skin tone matches specification EXACTLY in all poses.`,
  
  wrong_hair: `CRITICAL: Hair is incorrect.
    Required: ${order.character_specs.hairColor}, ${order.character_specs.hairStyle}
    Previous attempt had: [reviewer notes]
    Emphasize correct hair color and style in prompt.`,
  
  wrong_age: `CRITICAL: Character appears wrong age.
    Required age: ${order.character_specs.age} years old
    Previous attempt looked: [reviewer notes]
    Adjust age descriptors to match a ${order.character_specs.age}-year-old child.`,
  
  poor_quality: `CRITICAL: Image quality is insufficient.
    Issues: [reviewer notes]
    - Increase resolution
    - Reduce artifacts
    - Improve clarity
    Use highest quality settings available.`,
  
  // ... more templates
};

// Combine selected templates with reviewer notes
function generateRegenerationInstructions(selectedCategories, reviewerNotes, characterSpecs) {
  let instructions = "REGENERATION INSTRUCTIONS:\n\n";
  
  selectedCategories.forEach(category => {
    instructions += feedbackTemplates[category] + "\n\n";
  });
  
  if (reviewerNotes) {
    instructions += `ADDITIONAL REVIEWER NOTES:\n${reviewerNotes}\n\n`;
  }
  
  instructions += `CHARACTER SPECIFICATIONS (MUST MATCH EXACTLY):\n`;
  instructions += `- Name: ${characterSpecs.childName}\n`;
  instructions += `- Age: ${characterSpecs.age} years old\n`;
  instructions += `- Skin Tone: ${characterSpecs.skinTone}\n`;
  instructions += `- Hair: ${characterSpecs.hairColor}, ${characterSpecs.hairStyle}\n`;
  instructions += `- Clothing: ${characterSpecs.clothingStyle}\n`;
  instructions += `- Pronouns: ${characterSpecs.pronouns}\n`;
  
  return instructions;
}
```

### **Regeneration Limits**

To prevent infinite loops:

```javascript
// In rejection handler
if (order.regeneration_attempt >= 3) {
  // Too many attempts - escalate to senior reviewer or manual intervention
  await escalateOrder(order, {
    reason: 'max_regeneration_attempts_exceeded',
    message: `Order has been regenerated ${order.regeneration_attempt} times without approval`,
    action_required: 'manual_character_creation_or_refund'
  });
  
  // Update order status
  await updateOrder(order.id, {
    status: 'escalated',
    escalation_reason: 'max_regeneration_attempts',
    escalated_at: new Date().toISOString()
  });
  
} else {
  // Normal regeneration flow
  await updateOrder(order.id, {
    human_approved: false,
    qa_notes: rejectionNotes,
    regeneration_instructions: generatedInstructions,
    regeneration_attempt: order.regeneration_attempt + 1,
    status: 'ai_generation_required',
    next_workflow: '2.A.-bria-submit',
    rejection_history: [
      ...order.rejection_history,
      {
        attempt: order.regeneration_attempt,
        rejected_at: new Date().toISOString(),
        rejected_by: reviewerName,
        reason: rejectionNotes,
        categories: selectedCategories
      }
    ]
  });
}
```

### **Success Metrics for Feedback System**

Track these metrics to improve the system:

1. **First-Attempt Approval Rate**: Target > 85%
2. **Second-Attempt Approval Rate**: Target > 95%
3. **Average Regenerations per Order**: Target < 1.2
4. **Most Common Rejection Reasons**: Identify patterns
5. **Feedback Effectiveness**: Does feedback improve results?

### **Example: Complete Rejection Flow**

```javascript
async function rejectOrder(orderId, rejectionData) {
  const order = await getOrder(orderId);
  
  // Generate detailed instructions
  const instructions = generateRegenerationInstructions(
    rejectionData.categories,
    rejectionData.notes,
    order.character_specs
  );
  
  // Check regeneration limit
  if (order.regeneration_attempt >= 3) {
    return await escalateOrder(order, instructions);
  }
  
  // Store previous images for comparison
  const previousImages = {
    attempt: order.regeneration_attempt,
    images: order.character_image_urls,
    pdf_url: order.final_book_url,
    rejected_at: new Date().toISOString()
  };
  
  // Update order with feedback
  await updateOrder(orderId, {
    human_approved: false,
    human_reviewed_at: new Date().toISOString(),
    human_reviewer: rejectionData.reviewerName,
    qa_notes: rejectionData.notes,
    regeneration_instructions: instructions,
    regeneration_attempt: order.regeneration_attempt + 1,
    quality_issues: rejectionData.categories.map(cat => ({
      category: cat,
      description: feedbackTemplates[cat]
    })),
    previous_character_images: [
      ...(order.previous_character_images || []),
      previousImages
    ],
    rejection_history: [
      ...(order.rejection_history || []),
      {
        attempt: order.regeneration_attempt,
        rejected_at: new Date().toISOString(),
        rejected_by: rejectionData.reviewerName,
        categories: rejectionData.categories,
        notes: rejectionData.notes
      }
    ],
    status: 'ai_generation_required',
    next_workflow: '2.A.-bria-submit',
    updated_at: new Date().toISOString()
  });
  
  // Remove from review queue
  await removeFromReviewQueue(orderId);
  
  // Send notification to AI generation team
  await sendNotification({
    type: 'regeneration_required',
    orderId: order.amazon_order_id,
    attempt: order.regeneration_attempt + 1,
    instructions: instructions
  });
  
  console.log(`🔄 Order ${order.amazon_order_id} sent for regeneration (attempt ${order.regeneration_attempt + 1})`);
}
```

---

## 🛠️ **Implementation Options**

### **Option 1: Simple Spreadsheet Interface (MVP)**

**Pros**: Quick to implement, no coding required
**Cons**: Manual, not scalable

**Setup**:
1. Create Google Sheet with columns:
   - Order ID
   - Customer Name
   - Child Name
   - PDF Link
   - Cover Link
   - QA Score
   - Status
   - Approve Button
   - Reject Button

2. Use Google Apps Script to:
   - Query Supabase for pending reviews
   - Display in spreadsheet
   - Update Supabase when buttons clicked

**Google Apps Script Example**:
```javascript
function loadPendingReviews() {
  const supabaseUrl = 'https://mdnthwpcnphjnnblbvxk.supabase.co';
  const supabaseKey = 'YOUR_SERVICE_ROLE_KEY';
  
  const options = {
    'method': 'get',
    'headers': {
      'apikey': supabaseKey,
      'Authorization': 'Bearer ' + supabaseKey
    }
  };
  
  const response = UrlFetchApp.fetch(
    supabaseUrl + '/rest/v1/orders?status=eq.book_assembly_completed&human_approved=is.null',
    options
  );
  
  const orders = JSON.parse(response.getContentText());
  // Populate spreadsheet with orders
}

function approveOrder(orderId) {
  // Update Supabase: human_approved = true
}

function rejectOrder(orderId) {
  // Update Supabase: human_approved = false, status = 'ai_generation_required'
}
```

### **Option 2: Notion Database (Recommended for MVP)**

**Pros**: Better UI, built-in views, easy to use
**Cons**: Requires Notion API integration

**Setup**:
1. Create Notion database with properties:
   - Order ID (text)
   - Customer (text)
   - Child Name (text)
   - PDF Link (URL)
   - Cover Link (URL)
   - QA Score (number)
   - Status (select: Pending, Approved, Rejected)
   - Review Notes (text)
   - Reviewed By (person)
   - Reviewed At (date)

2. Create n8n workflow to sync:
   - Query Supabase every 5 minutes for pending reviews
   - Create Notion page for each new review
   - Monitor Notion for status changes
   - Update Supabase when status changes

**n8n Workflow Structure**:
```
Cron Trigger (Every 5 min)
    ↓
Query Supabase for Pending Reviews
    ↓
For Each Order:
    ↓
    Check if exists in Notion
    ↓
    If not, Create Notion Page
    ↓
Query Notion for Completed Reviews
    ↓
For Each Completed:
    ↓
    Update Supabase (approve/reject)
    ↓
    Archive Notion Page
```

### **Option 3: Custom Web Dashboard (Production)**

**Pros**: Full control, best UX, scalable
**Cons**: Requires development time

**Tech Stack**:
- Frontend: Next.js or simple HTML/JS
- Backend: Supabase (direct API calls)
- Hosting: Cloudflare Pages or Vercel

**Features**:
- Login authentication
- List of pending reviews
- PDF preview (iframe or PDF.js)
- Image preview for cover
- Character specs display
- One-click approve/reject
- Notes field for rejection reasons
- Review history

**Simple HTML Example** (can be hosted as static file):
```html
<!DOCTYPE html>
<html>
<head>
  <title>Little Hero Books - Review Queue</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <h1>Review Queue</h1>
  <div id="reviews"></div>
  
  <script>
    const supabase = supabase.createClient(
      'https://mdnthwpcnphjnnblbvxk.supabase.co',
      'YOUR_SERVICE_ROLE_KEY'
    );
    
    async function loadReviews() {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'book_assembly_completed')
        .is('human_approved', null)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error:', error);
        return;
      }
      
      const container = document.getElementById('reviews');
      container.innerHTML = data.map(order => `
        <div class="review-card">
          <h2>Order: ${order.amazon_order_id}</h2>
          <p>Customer: ${order.customer_name}</p>
          <p>Child: ${order.character_specs.childName}</p>
          <p>QA Score: ${order.qa_score}</p>
          <a href="${order.final_book_url}" target="_blank">View PDF</a>
          <a href="${order.final_cover_url}" target="_blank">View Cover</a>
          <button onclick="approve('${order.id}')">✅ Approve</button>
          <button onclick="reject('${order.id}')">❌ Reject</button>
        </div>
      `).join('');
    }
    
    async function approve(orderId) {
      const { error } = await supabase
        .from('orders')
        .update({
          human_approved: true,
          human_reviewed_at: new Date().toISOString(),
          human_reviewer: 'reviewer_name',
          next_workflow: '4-print-fulfillment'
        })
        .eq('id', orderId);
      
      if (!error) {
        alert('Order approved!');
        loadReviews();
      }
    }
    
    async function reject(orderId) {
      const notes = prompt('Rejection reason:');
      const { error } = await supabase
        .from('orders')
        .update({
          human_approved: false,
          human_reviewed_at: new Date().toISOString(),
          human_reviewer: 'reviewer_name',
          qa_notes: notes,
          status: 'ai_generation_required',
          next_workflow: '2.A.-bria-submit'
        })
        .eq('id', orderId);
      
      if (!error) {
        alert('Order rejected and sent back for regeneration');
        loadReviews();
      }
    }
    
    // Load reviews on page load
    loadReviews();
    
    // Refresh every 30 seconds
    setInterval(loadReviews, 30000);
  </script>
</body>
</html>
```

## 📊 **Database Schema**

### **Orders Table Fields Used**:
```sql
-- Set by Workflow 3:
status VARCHAR(50) -- 'book_assembly_completed'
requires_human_review BOOLEAN -- true if QA score < 0.8
human_approved BOOLEAN -- NULL (waiting for review)
qa_score DECIMAL(3,2) -- 0.00 to 1.00
final_book_url TEXT -- PDF link
final_cover_url TEXT -- Cover image link

-- Set by Human Reviewer:
human_approved BOOLEAN -- true or false
human_reviewed_at TIMESTAMP
human_reviewer VARCHAR(100) -- reviewer name/email
qa_notes TEXT -- rejection reason (if rejected)
status VARCHAR(50) -- 'book_assembly_completed' (if approved) or 'ai_generation_required' (if rejected)
next_workflow VARCHAR(50) -- '4-print-fulfillment' (if approved) or '2.A.-bria-submit' (if rejected)
```

### **Human Review Queue Table** (Optional):
```sql
CREATE TABLE human_review_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    review_type VARCHAR(50) DEFAULT 'quality_check',
    review_priority VARCHAR(20) DEFAULT 'normal',
    assigned_to VARCHAR(255),
    reviewed_by VARCHAR(100),
    review_notes TEXT,
    decision VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_human_review_queue_status ON human_review_queue(status);
CREATE INDEX idx_human_review_queue_order_id ON human_review_queue(order_id);
```

## 🔔 **Notification System**

### **When to Notify Reviewers**:
1. New order added to review queue
2. Order waiting > 1 hour (reminder)
3. High priority order added

### **Notification Methods**:

**Option 1: Email (SendGrid)**:
```javascript
// In Workflow 3, after adding to review queue:
await sendEmail({
  to: 'reviewer@littleherobooks.com',
  subject: '📋 New Book Ready for Review',
  body: `
    Order ${orderId} is ready for quality review.
    
    Customer: ${customerName}
    Child: ${childName}
    QA Score: ${qaScore}
    
    Review here: https://review.littleherobooks.com
  `
});
```

**Option 2: Slack**:
```javascript
// Webhook to Slack channel
await fetch('https://hooks.slack.com/services/YOUR/WEBHOOK/URL', {
  method: 'POST',
  body: JSON.stringify({
    text: `📋 New book ready for review: Order ${orderId}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Order:* ${orderId}\n*Customer:* ${customerName}\n*QA Score:* ${qaScore}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review Now' },
            url: `https://review.littleherobooks.com?order=${orderId}`
          }
        ]
      }
    ]
  })
});
```

## ⏱️ **Review SLA (Service Level Agreement)**

### **Target Times**:
- **Normal Priority**: Review within 2 hours
- **High Priority**: Review within 30 minutes
- **Urgent**: Review within 15 minutes

### **Escalation**:
If order not reviewed within SLA:
1. Send reminder notification
2. Escalate to senior reviewer
3. Send alert to management

## 🔒 **Security Considerations**

1. **Authentication**: Reviewers must log in
2. **Authorization**: Only approved reviewers can approve/reject
3. **Audit Trail**: Log all review actions
4. **Rate Limiting**: Prevent abuse of approve/reject endpoints

## 📈 **Metrics to Track**

1. **Average Review Time**: Target < 15 minutes
2. **Approval Rate**: Target > 85%
3. **Rejection Reasons**: Track common issues
4. **Reviewer Performance**: Reviews per hour, accuracy
5. **Queue Length**: Number of orders waiting

## 🚀 **Recommended Implementation Path**

### **Phase 1: MVP (Week 1)**
Use **Notion** or **Google Sheets** for quick setup:
1. Set up Notion database or Google Sheet
2. Create n8n workflow to sync with Supabase
3. Train reviewers on the process
4. Test with 5-10 orders

### **Phase 2: Automation (Week 2-3)**
Add automation:
1. Automatic notifications (email/Slack)
2. SLA monitoring and reminders
3. Metrics dashboard
4. Auto-approve high-quality orders (QA score > 0.95)

### **Phase 3: Custom Dashboard (Week 4+)**
Build custom interface:
1. Simple HTML dashboard (like example above)
2. Host on Cloudflare Pages
3. Add authentication
4. Improve UX with better PDF preview

## 🎯 **Quick Start: Simplest Possible Implementation**

**For immediate testing, use this simple approach**:

1. **Reviewer checks Supabase directly**:
   - Go to Supabase dashboard
   - Open `orders` table
   - Filter: `status = 'book_assembly_completed'` AND `human_approved IS NULL`
   - Click on order to view details
   - Copy `final_book_url` and open in browser
   - Manually update fields:
     - `human_approved = true` (or false)
     - `human_reviewed_at = NOW()`
     - `human_reviewer = 'Your Name'`
     - If approved: `next_workflow = '4-print-fulfillment'`
     - If rejected: `status = 'ai_generation_required'`, `next_workflow = '2.A.-bria-submit'`

2. **Workflow 4 will pick up approved orders** on next cron run

This works immediately with zero additional development!

---

## 📝 **Summary**

The human review step is **flexible** and can be implemented at different levels:

1. **Manual** (Supabase dashboard) - Works immediately
2. **Semi-automated** (Notion/Sheets) - Better UX, still simple
3. **Fully automated** (Custom dashboard) - Best UX, production-ready

Start simple and evolve as needed. The key is that **Workflow 3 sets the flags** and **Workflow 4 checks them** - the review interface is just a way to update those flags.

