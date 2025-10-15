# Human Review Quick Start Guide

## 🎯 **What is Human Review?**

Human review is a **quality control checkpoint** between Workflow 3 (Book Assembly) and Workflow 4 (Print & Fulfillment). It ensures every book meets quality standards before being sent to print.

## 🔄 **How It Works**

```
Workflow 3 completes → Calculates Quality Score → Decision Point:

IF quality_score >= 0.8 (Good Quality):
  ✅ Auto-approve
  → human_approved = TRUE
  → Goes directly to Workflow 4
  
IF quality_score < 0.8 (Needs Review):
  ⏸️ Pause for human review
  → requires_human_review = TRUE
  → human_approved = NULL
  → Added to human_review_queue
  → Notification sent to reviewer
  → Waits for human action
  
Human Reviewer Options:
  ✅ APPROVE → human_approved = TRUE → Workflow 4 prints it
  ❌ REJECT → human_approved = FALSE → Back to Workflow 2A for regeneration
```

## 🚀 **3 Implementation Options**

### **Option 1: Manual (Supabase Dashboard) - SIMPLEST**
**Time to Set Up**: 0 minutes (works immediately!)
**Best For**: Testing, MVP, low volume

**How to Review Orders**:
1. Go to Supabase dashboard: https://mdnthwpcnphjnnblbvxk.supabase.co
2. Open `orders` table
3. Filter: `status = 'book_assembly_completed'` AND `human_approved IS NULL`
4. Click on order to view details
5. Copy `final_book_url` and open PDF in browser
6. Review the book quality
7. **To Approve**: Update fields:
   - `human_approved = true`
   - `human_reviewed_at = NOW()`
   - `human_reviewer = 'Your Name'`
   - `next_workflow = '4-print-fulfillment'`
8. **To Reject**: Update fields:
   - `human_approved = false`
   - `human_reviewed_at = NOW()`
   - `human_reviewer = 'Your Name'`
   - `qa_notes = 'Reason for rejection'`
   - `regeneration_instructions = 'CRITICAL: [Specific instructions for fixing the issue]'`
   - `regeneration_attempt = regeneration_attempt + 1`
   - `status = 'ai_generation_required'`
   - `next_workflow = '2.A.-bria-submit'`
   
   **Important**: Be specific in `regeneration_instructions`! This guides the AI on what to fix.
   Example: "CRITICAL: Hair color must be dark brown, not blonde. Previous attempt had blonde hair which was incorrect. Emphasize brown hair in all poses."

**Pros**: Works immediately, no setup
**Cons**: Manual, not user-friendly

---

### **Option 2: Notion Database - RECOMMENDED FOR MVP**
**Time to Set Up**: 30-60 minutes
**Best For**: MVP, small team, better UX

**Setup Steps**:
1. Create Notion database with these properties:
   - Order ID (text)
   - Customer Name (text)
   - Child Name (text)
   - PDF Link (URL)
   - Cover Link (URL)
   - QA Score (number)
   - Status (select: Pending, Approved, Rejected)
   - Review Notes (text)
   - Reviewed By (person)
   - Reviewed At (date)

2. Create n8n workflow to sync Notion ↔ Supabase:
   - Cron trigger (every 5 minutes)
   - Query Supabase for pending reviews
   - Create Notion pages for new orders
   - Monitor Notion for status changes
   - Update Supabase when reviewer approves/rejects

**Pros**: Better UX, collaborative, easy to use
**Cons**: Requires Notion API setup, slight delay in sync

**See Full Guide**: `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md` for complete n8n workflow structure

---

### **Option 3: Custom Web Dashboard - PRODUCTION READY**
**Time to Set Up**: 2-4 hours
**Best For**: Production, high volume, best UX

**Features**:
- Login authentication
- Real-time order list
- PDF preview (embedded viewer)
- Character specs display
- One-click approve/reject
- Review notes and history
- Metrics dashboard

**Quick Deploy**:
We've included a ready-to-use HTML dashboard in the implementation guide that you can:
1. Copy the HTML file
2. Update Supabase credentials
3. Deploy to Cloudflare Pages (free)
4. Share URL with reviewers

**See Full Code**: `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md` includes complete HTML dashboard code

---

## 📊 **Database Fields Used**

### **Set by Workflow 3** (Developer A):
```sql
status = 'book_assembly_completed'
requires_human_review = true/false
human_approved = NULL (waiting for review)
qa_score = 0.00 to 1.00
final_book_url = 'https://...'
final_cover_url = 'https://...'
```

### **Set by Human Reviewer**:
```sql
-- If APPROVED:
human_approved = true
human_reviewed_at = NOW()
human_reviewer = 'reviewer_name'
next_workflow = '4-print-fulfillment'

-- If REJECTED:
human_approved = false
human_reviewed_at = NOW()
human_reviewer = 'reviewer_name'
qa_notes = 'Reason for rejection'
status = 'ai_generation_required'
next_workflow = '2.A.-bria-submit'
```

### **Workflow 4 Checks** (Developer B):
```sql
-- Only process orders with:
status = 'book_assembly_completed'
human_approved = true  -- Must be explicitly true
print_job_id IS NULL   -- Not yet printed
```

---

## 🔔 **Notifications**

### **When to Notify**:
1. New order added to review queue
2. Order waiting > 1 hour (reminder)
3. High priority order added

### **How to Notify**:
- **Email** (SendGrid): Simple, works for everyone
- **Slack**: Real-time, good for teams
- **SMS** (Twilio): For urgent orders

**See Implementation**: Full notification code examples in `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md`

---

## ⏱️ **Review SLA (Service Level Agreement)**

### **Target Times**:
- **Normal Priority**: Review within 2 hours
- **High Priority**: Review within 30 minutes
- **Urgent**: Review within 15 minutes

### **What to Check**:
1. **Character Consistency**: Does character look the same across all pages?
2. **Character Accuracy**: Does character match specifications (hair color, skin tone, etc.)?
3. **Image Quality**: Are images clear and high quality?
4. **Layout**: Is text readable? Are characters positioned correctly?
5. **Content**: Is content appropriate and error-free?

---

## 🎯 **Recommended Path**

### **For Immediate Testing** (Today):
Use **Option 1** (Supabase Dashboard)
- Works immediately
- No setup required
- Perfect for testing workflows

### **For MVP Launch** (This Week):
Implement **Option 2** (Notion Database)
- Better UX for reviewers
- Easy to set up
- Good for small team

### **For Production** (Next Month):
Build **Option 3** (Custom Dashboard)
- Professional interface
- Best user experience
- Scalable for growth

---

## 🔒 **Security Notes**

1. **Access Control**: Only approved reviewers should have access
2. **Audit Trail**: All reviews are logged in database
3. **Authentication**: Use proper login for custom dashboard
4. **API Keys**: Keep Supabase service role key secure

---

## 📈 **Metrics to Track**

1. **Average Review Time**: Target < 15 minutes
2. **Approval Rate**: Target > 85%
3. **Queue Length**: Number of orders waiting
4. **Reviewer Performance**: Reviews per hour
5. **Rejection Reasons**: Track common issues

---

## 🔄 **Feedback-Driven Regeneration**

**Critical Feature**: When rejecting an order, you MUST provide specific feedback so the AI knows what to fix!

### **Why Feedback Matters**
Without feedback, the AI would regenerate with the same prompt and produce the same poor result. Your feedback guides the AI to fix specific issues.

### **How to Provide Good Feedback**

**❌ Bad Feedback** (vague):
- "Character doesn't look right"
- "Poor quality"
- "Try again"

**✅ Good Feedback** (specific):
- "CRITICAL: Hair color must be dark brown, not blonde. Current hair is too light. Emphasize dark brown hair in all 12 poses."
- "CRITICAL: Character looks 8 years old but should be 5. Make character appear younger with rounder face and smaller features."
- "CRITICAL: Skin tone is too light. Should be medium brown (tan). Adjust skin tone to match specification exactly."

### **Feedback Categories**
Use these categories to structure your feedback:

1. **Character Inconsistency**: Looks different across pages
2. **Wrong Skin Tone**: Doesn't match specification
3. **Wrong Hair**: Color or style incorrect
4. **Wrong Age**: Appears too old or too young
5. **Wrong Clothing**: Doesn't match style
6. **Poor Quality**: Blurry, pixelated, artifacts
7. **Background Issues**: Background removal problems
8. **Pose Problems**: Pose doesn't fit scene

### **Regeneration Limits**
- **Max 3 attempts**: After 3 rejections, order is escalated for manual intervention
- **Track attempts**: `regeneration_attempt` field shows current attempt number
- **Compare versions**: `previous_character_images` stores rejected versions for comparison

**See Full Guide**: `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md` for complete feedback system documentation

---

## 🚨 **Important: Human Review vs Error Recovery**

**Human Review (Between Workflow 3 & 4)**:
- Handles **quality issues**
- Examples: Character inconsistency, poor quality, wrong details
- Action: Human approves or rejects **with specific feedback**
- Trigger: Workflow completes but quality is questionable
- **Feedback loop**: Rejected orders go back to Workflow 2A with instructions

**Error Recovery (Workflow 5)**:
- Handles **technical failures**
- Examples: API timeouts, network errors, service crashes
- Action: Automatic retry with backoff
- Trigger: Workflow crashes or fails
- **No feedback needed**: Automatic retry logic

**Key Safeguard**: Workflow 5 will NEVER touch orders in human review to avoid interference.

---

## 📚 **Full Documentation**

For complete implementation details, code examples, and deployment guides:

**See**: `docs/HUMAN_REVIEW_IMPLEMENTATION_GUIDE.md`

This includes:
- Complete code for all 3 options
- Ready-to-deploy HTML dashboard
- n8n workflow examples
- Notification system code
- Security best practices
- Metrics and monitoring setup

---

## ❓ **FAQ**

**Q: Can we skip human review for high-quality orders?**
A: Yes! Orders with QA score ≥ 0.8 are auto-approved and go directly to printing.

**Q: What happens if an order is rejected?**
A: It goes back to Workflow 2A for character regeneration with the rejection notes.

**Q: How long does review take?**
A: Target is < 15 minutes per order. Most reviews take 5-10 minutes.

**Q: Can multiple reviewers work simultaneously?**
A: Yes! The system supports multiple reviewers working on different orders.

**Q: What if a reviewer makes a mistake?**
A: All reviews are logged in the audit trail. Orders can be recalled before printing.

---

**Ready to start reviewing books! 📚✨**

