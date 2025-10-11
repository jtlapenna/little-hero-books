# 🎯 Character Positioning Guide

## 📋 What You Need to Do

You now have individual HTML test pages for each of your 4 pages. Each page has:
- ✅ **Your background image** loaded from R2
- ✅ **Your character pose** loaded from R2  
- ✅ **Your text box overlay** positioned exactly as designed
- ✅ **Interactive position controls** to adjust character placement
- ✅ **Copy CSS button** to get exact positioning values

## 🚀 How to Position Characters

### Step 1: Start the Test Server
```bash
cd test-pages
node server.js
```

### Step 2: Open Each Test Page
- **Page 01**: http://localhost:3001/page01-test.html
- **Page 02**: http://localhost:3001/page02-test.html  
- **Page 03**: http://localhost:3001/page03-test.html
- **Page 04**: http://localhost:3001/page04-test.html

### Step 3: Position Each Character
For each page:
1. **Open the page** in your browser
2. **Use the position controls** (top-right corner) to adjust:
   - **Left/Right**: Horizontal position (%)
   - **Top**: Vertical position (%)  
   - **Width**: Character size (px)
3. **Click "Copy CSS"** when positioning looks perfect
4. **Paste the CSS** into a text file for that page

### Step 4: Update the n8n Workflow
Once you have all 4 positions, update the `getPageLayout()` function in the workflow:

```javascript
function getPageLayout(pageNumber) {
  const layouts = {
    1: { // Garden path twilight
      character: { position: 'right: 5%; top: 15%;', width: 300 } // YOUR VALUES HERE
    },
    2: { // Garden gate magical  
      character: { position: 'left: 5%; top: 20%;', width: 280 } // YOUR VALUES HERE
    },
    3: { // Forest night
      character: { position: 'right: 8%; top: 10%;', width: 320 } // YOUR VALUES HERE
    },
    4: { // Forest clearing
      character: { position: 'left: 8%; top: 15%;', width: 300 } // YOUR VALUES HERE
    }
  };
  
  return layouts[pageNumber] || layouts[1];
}
```

## 🎨 Current Default Positions

### Page 01 - Garden Path Twilight
- **Position**: Right 5%, Top 15%
- **Width**: 300px
- **Character**: pose01.png

### Page 02 - Garden Gate Magical  
- **Position**: Left 5%, Top 20%
- **Width**: 280px
- **Character**: pose02.png

### Page 03 - Forest Night
- **Position**: Right 8%, Top 10%  
- **Width**: 320px
- **Character**: pose03.png

### Page 04 - Forest Clearing
- **Position**: Left 8%, Top 15%
- **Width**: 300px
- **Character**: pose04.png

## 🔧 Position Control Features

Each test page includes:
- **Real-time positioning** - drag the character around
- **Number inputs** - fine-tune exact values
- **Copy CSS button** - get the exact CSS for the workflow
- **Debug info** - shows current specifications
- **Red dashed border** - makes character area visible (remove when done)

## 📝 What to Look For

### Good Character Positioning:
- ✅ **Character fits naturally** in the scene
- ✅ **Doesn't overlap** with important background elements
- ✅ **Text box is readable** (positioned at bottom 3%)
- ✅ **Character size** looks proportional to the scene
- ✅ **Consistent style** across all pages

### Common Adjustments:
- **Move character** away from text box area
- **Adjust size** to match scene scale
- **Position** to complement background composition
- **Ensure** character doesn't block important story elements

## 🎯 After Positioning

Once you have all 4 positions:

1. **Copy the CSS** from each page
2. **Update the n8n workflow** with your exact values
3. **Test the workflow** to ensure characters appear correctly
4. **Remove debug borders** from the final workflow
5. **Save the final positions** for future reference

## 📁 Files Created

- `test-pages/page01-test.html` - Garden Path Twilight
- `test-pages/page02-test.html` - Garden Gate Magical  
- `test-pages/page03-test.html` - Forest Night
- `test-pages/page04-test.html` - Forest Clearing
- `test-pages/server.js` - Test server
- `CHARACTER_POSITIONING_GUIDE.md` - This guide

## 🚀 Ready to Start?

```bash
# 1. Start the test server
cd test-pages
node server.js

# 2. Open your browser to:
# http://localhost:3001/page01-test.html

# 3. Position each character and copy the CSS!

# 4. Update the n8n workflow with your final positions
```

**The text box overlay is already perfectly positioned** - you just need to position the characters to complement each scene!
