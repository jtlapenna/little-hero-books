# Little Hero Books - Style Guide

This document outlines the standardized design specifications for all book pages, ensuring consistency and print quality.

---

## **1. Page Dimensions**

*   **Size:** 11.25 inches × 8.75 inches
*   **DPI:** 300 DPI (for print-on-demand services)
*   **Margins:** 0 (full bleed)

---

## **2. Typography**

*   **Font Family:** 'CustomFont', 'Arial', sans-serif
    *   **File:** `assets/fonts/custom-font.ttf`
*   **Font Size:** 20px (locked)
*   **Letter Spacing:** 1.5px (locked)
*   **Font Color:** `#312116` (locked)
*   **Line Height:** 1.4 (standard for readability)
*   **Text Alignment:** Center (within the text box)
*   **Word Wrapping:** `white-space: pre-wrap;` (preserves line breaks from content)

---

## **3. Text Box**

*   **Background Image:** `assets/overlays/text-boxes/standard-box.png`
    *   **Styling:** `background-size: contain; background-repeat: no-repeat; background-position: center;`
*   **Positioning:**
    *   `position: absolute;`
    *   `left: 50%;` (horizontally centered)
    *   `transform: translateX(-50%);` (ensures true centering)
    *   `bottom: 3%;` (from the bottom edge of the page)
*   **Dimensions:**
    *   `width: 65%;` (relative to page width)
    *   `height: auto;` (adjusts to content)
*   **Inner Padding:** `padding: 40px 60px;` (top/bottom 40px, left/right 60px)
*   **Display:** `display: flex; align-items: center; justify-content: center;` (centers text vertically within the box)
*   **Text Content:** Always formatted for 2 lines maximum.

---

## **4. Character Overlays**

*   **Positioning:**
    *   `position: absolute;`
    *   `right: 8%;` (from the right edge of the page)
    *   `top: 25%;` (from the top edge of the page)
*   **Dimensions:**
    *   `width: 250px;` (default size)
    *   `height: auto;` (maintains aspect ratio)
*   **Layering:** `z-index: 100;` (ensures character is above background and text box)

---

## **5. Background Images**

*   **Styling:**
    *   `background-size: cover;` (covers the entire page, cropping if necessary)
    *   `background-position: center;` (centers the background image)
    *   `background-repeat: no-repeat;` (prevents tiling)

---

## **6. General Page Structure**

*   All pages will use a `div` with class `page` as the main container, which will have the background image applied.
*   Text content will be within a `div` with class `text-box`, containing a `div` with class `text-content`.
*   Character images will be `img` tags with class `character-overlay`.

---

## **7. File Organization**

*   **Templates:** `templates/page-template.html` (Handlebars template for dynamic content)
*   **Styles:** `assets/css/page-styles.css` (Centralized CSS with locked specifications)
*   **Test Pages:** `pages/pageXX-test.html` (Individual page tests)
*   **Standalone Tests:** `pageXX-standalone.html` (Self-contained test files)

---

## **8. Content Guidelines**

*   **Text Length:** Maximum 2 lines per page
*   **Character Count:** Approximately 60-80 characters per line
*   **Story Flow:** Each page should advance the narrative
*   **Age Appropriateness:** Content suitable for ages 3-7

---

## **9. Print Specifications**

*   **Color Space:** RGB (for digital display) → CMYK (for print)
*   **Resolution:** 300 DPI minimum
*   **Bleed:** 0.125 inches on all sides (included in 11.25" × 8.75" dimensions)
*   **Safe Area:** Keep important content within 11" × 8.5" (accounting for bleed)

---

## **10. Development Workflow**

1. **Create Test Page:** Use `pageXX-standalone.html` as starting point
2. **Apply Background:** Set background image for the page
3. **Add Text Content:** Ensure exactly 2 lines of text
4. **Position Character:** Adjust character placement as needed
5. **Test Layout:** Open in browser to verify positioning
6. **Generate PDF:** Use Puppeteer to create final PDF

---

*Last Updated: [Current Date]*
*Version: 1.0*
