# Open Graph (OG) Image Guide

## What is an OG Image?

An **OG (Open Graph) image** is the preview image that appears when you share a link on social media platforms like:
- Facebook
- Twitter/X
- LinkedIn
- WhatsApp
- Slack
- Discord
- And many other platforms

When someone shares your website URL, the OG image is what shows up as the preview image in the post.

### Example:
When you share `https://www.littleherolabs.com` on Facebook, people will see:
- **Image**: Your OG image
- **Title**: "Little Hero Labs - Become the Hero of Your Own Story"
- **Description**: Your meta description

---

## What Should Your OG Image Look Like?

### Technical Requirements

**Recommended Size**: 1200 x 630 pixels (1.91:1 aspect ratio)
**Minimum Size**: 600 x 315 pixels
**Maximum Size**: 1200 x 630 pixels (larger files are automatically resized)
**File Format**: JPG or PNG
**File Size**: Under 1MB (ideally 200-500KB for faster loading)

### Design Guidelines

**For Little Hero Books, your OG image should include:**

1. **Your Logo/Brand Name**
   - "Little Hero Labs" or your logo
   - Make it prominent but not overwhelming

2. **Key Message/Tagline**
   - "Every child is the hero of their own story"
   - Or "Personalized Children's Books"
   - Keep text large and readable (at least 24pt font)

3. **Visual Elements**
   - Book illustration or cover
   - Child-friendly imagery
   - Your brand colors (coral, teal, navy, etc.)
   - Magical/adventure theme

4. **Call to Action (Optional)**
   - "Create Your Book Today"
   - "Order Now"
   - Keep it simple

### Design Tips

✅ **DO:**
- Use high contrast (text should be easily readable)
- Keep it simple and uncluttered
- Use your brand colors
- Make text large and bold
- Include your logo/brand name
- Use high-quality images

❌ **DON'T:**
- Overcrowd with too much text
- Use small fonts (they won't be readable when shared)
- Use low-resolution images
- Include important info in the edges (may be cropped on some platforms)
- Use too many colors or busy backgrounds

---

## Example OG Image Ideas for Little Hero Books

### Option 1: Book Cover Style
- Background: Soft gradient (teal to sage green)
- Center: Illustration of a personalized book cover
- Top: "Little Hero Labs" logo
- Bottom: "Personalized Children's Books" tagline
- Small text: "Every child is the hero of their own story"

### Option 2: Adventure Theme
- Background: Magical forest or adventure scene
- Center: Child character from your stories
- Top: "Little Hero Labs" in bold
- Bottom: "Create Your Child's Adventure Story"
- Accent: Stars, compass, or adventure elements

### Option 3: Simple & Clean
- Background: Solid color (your brand coral or navy)
- Center: Large book icon or illustration
- Top: "Little Hero Labs"
- Bottom: "Personalized Children's Books"
- Minimal design, maximum impact

---

## How to Create Your OG Image

### Option 1: Use Canva (Easiest - Recommended)

1. Go to [Canva.com](https://www.canva.com)
2. Create a custom design: **1200 x 630 pixels**
3. Search for "Facebook post" templates (they're the right size)
4. Customize with:
   - Your logo
   - Your tagline
   - Your brand colors
   - Book/child imagery
5. Download as JPG or PNG
6. Name it `og-image.jpg`

### Option 2: Use Figma or Adobe Illustrator

1. Create a new artboard: 1200 x 630 pixels
2. Design your OG image
3. Export as JPG (optimized for web)
4. Name it `og-image.jpg`

### Option 3: Use Online OG Image Generators

- [og-image.vercel.app](https://og-image.vercel.app) - Free, customizable
- [Bannerbear](https://www.bannerbear.com) - More advanced
- [Social Share Preview](https://socialsharepreview.com) - Preview tool

### Option 4: Hire a Designer

If you want something professional, hire a designer on:
- Fiverr
- Upwork
- 99designs

**Budget**: $20-100 depending on complexity

---

## Where to Put Your OG Image

1. **Save the file** as `og-image.jpg` (or `og-image.png`)
2. **Place it** in your `frontend/public/` directory
3. **Path**: `/public/og-image.jpg`
4. **URL**: Will be accessible at `https://www.littleherolabs.com/og-image.jpg`

The code in `Layout.astro` already references this path, so once you add the file, it will work automatically!

---

## Testing Your OG Image

### Before Publishing:

1. **Preview Tool**: Use [Social Share Preview](https://socialsharepreview.com)
   - Enter your URL
   - See how it looks on different platforms

2. **Facebook Debugger**: [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug)
   - Enter your URL
   - Click "Scrape Again" to refresh the preview
   - See exactly how Facebook will display it

3. **Twitter Card Validator**: [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator)
   - Test how it appears on Twitter/X

### After Publishing:

- Share your URL on Facebook (as a test post, you can delete it)
- Share on Twitter/X
- Check how it looks on different devices

---

## Quick Start Checklist

- [ ] Create OG image (1200 x 630px)
- [ ] Include "Little Hero Labs" branding
- [ ] Include tagline or key message
- [ ] Use brand colors
- [ ] Keep text large and readable
- [ ] Save as `og-image.jpg`
- [ ] Place in `/frontend/public/og-image.jpg`
- [ ] Test with Social Share Preview tool
- [ ] Deploy and test on actual social platforms

---

## Current Status

✅ **Code is ready**: Your `Layout.astro` already has OG image support
⏳ **Image needed**: Just create and add the `og-image.jpg` file to `/public/`

Once you add the image file, it will automatically work for all pages!

---

## Need Help?

If you want, I can help you:
- Create a design brief for a designer
- Review your OG image before publishing
- Adjust the code if you want different images per page
- Set up page-specific OG images (e.g., different image for homepage vs. product pages)

Just let me know what you'd like to do!

