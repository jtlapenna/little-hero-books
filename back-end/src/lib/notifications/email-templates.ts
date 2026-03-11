/**
 * Branded HTML email templates for Little Hero Labs D2C emails.
 * Uses email-safe inline styles for maximum compatibility.
 */

// Brand colors from website design system
const COLORS = {
  coral: '#F9786B',
  teal: '#5AC6B1',
  gold: '#F9BB3A',
  navy: '#2D3142',
  charcoal: '#333333',
  offWhite: '#FFFCF8',
  lightGray: '#F5F5F5',
  white: '#FFFFFF',
};

// Email-safe fonts (closest matches to website fonts)
const FONTS = {
  heading: "Georgia, 'Times New Roman', serif", // Matches Garamond/Playfair feel
  body: "Arial, Helvetica, sans-serif", // Clean sans-serif for readability
  display: "Arial, Helvetica, sans-serif", // Use same as body for consistent cross-platform display
};

// Logo URL - hosted on the website
const LOGO_URL = 'https://littleherolabs.com/assets/logo.png';

export interface EmailTemplateOptions {
  /** Email heading/title */
  heading: string;
  /** Main body content (can include HTML) */
  body: string;
  /** Optional preview character image URL */
  previewImageUrl?: string;
  /** Optional CTA button */
  ctaButton?: {
    text: string;
    url: string;
  };
  /** Optional info box content */
  infoBox?: string;
  /** Optional extra content block shown after the body and before any CTA */
  supplementalContent?: string;
  /** Child's name for personalization */
  childName?: string;
}

/**
 * Build the branded header with coral bar, logo, and brand name.
 * Logo aspect ratio is ~0.76:1 (2000x2617), so height 44px → width ~34px
 */
function buildHeader(): string {
  return `
    <!-- Header -->
    <tr>
      <td style="background-color: ${COLORS.coral}; padding: 20px 32px; text-align: center;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
          <tr>
            <td style="vertical-align: middle; padding-right: 10px;">
              <img src="${LOGO_URL}" alt="Little Hero Labs" width="34" height="44" style="display: block; border-radius: 6px;" />
            </td>
            <td style="vertical-align: middle;">
              <span style="font-family: ${FONTS.display}; font-size: 24px; font-weight: 700; color: ${COLORS.white};">
                Little Hero Labs
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

/**
 * Build the footer with tagline (matches website footer style).
 */
function buildFooter(): string {
  return `
    <!-- Footer -->
    <tr>
      <td style="background-color: ${COLORS.navy}; padding: 24px 32px; text-align: center;">
        <p style="margin: 0 0 4px 0; font-family: ${FONTS.display}; font-size: 16px; font-weight: 700; color: ${COLORS.white};">
          Little Hero Labs
        </p>
        <p style="margin: 0 0 12px 0; font-family: ${FONTS.heading}; font-size: 13px; font-style: italic; color: #C7D6B8;">
          "Every child is the hero of their own story."
        </p>
        <p style="margin: 0; font-family: ${FONTS.body}; font-size: 12px; color: #C7D6B8;">
          <a href="https://littleherolabs.com" style="color: #C7D6B8; text-decoration: none;">littleherolabs.com</a>
        </p>
      </td>
    </tr>
  `;
}

/**
 * Build a CTA button (matches website button style).
 */
function buildButton(text: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px auto;">
      <tr>
        <td style="border-radius: 50px; background-color: ${COLORS.coral};">
          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 36px; font-family: ${FONTS.body}; font-size: 16px; font-weight: 600; color: ${COLORS.white}; text-decoration: none; border-radius: 50px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build an info box (for order details, tracking, etc).
 */
function buildInfoBox(content: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="background-color: #FAF3E3; padding: 20px 24px; border-radius: 12px; border-left: 4px solid ${COLORS.teal};">
          ${content}
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build the preview character image section.
 */
function buildPreviewImage(imageUrl: string, childName?: string): string {
  const alt = childName ? `${childName}'s character preview` : 'Character preview';
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td style="text-align: center;">
          <img 
            src="${imageUrl}" 
            alt="${alt}" 
            width="180" 
            style="display: block; margin: 0 auto; max-width: 180px; height: auto; border-radius: 16px; border: 3px solid ${COLORS.gold}; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
          />
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build a sibling order summary block for confirmation emails.
 * If previewImageUrl is present for all items, render each child with image + name.
 * Otherwise callers should fall back to names-only data only.
 */
export function buildSiblingItemRows(items: Array<{ childName?: string; previewImageUrl?: string }>): string {
  if (!items.length) return '';

  const rows = items.map((item, index) => {
    const childName = item.childName?.trim() || 'Your little hero';
    const imageCell = item.previewImageUrl
      ? `
          <td style="width: 112px; vertical-align: top; padding-right: 14px;">
            <img
              src="${item.previewImageUrl}"
              alt="${childName}'s character preview"
              width="98"
              style="display: block; width: 98px; max-width: 98px; height: auto; border-radius: 14px; border: 3px solid ${COLORS.gold};"
            />
          </td>
        `
      : '';

    return `
      <tr>
        <td style="padding: 14px 16px; border: 1px solid #F1E6D6; border-radius: 12px; background-color: #FFFCF8;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              ${imageCell}
              <td style="vertical-align: middle;">
                <p style="margin: 0 0 4px 0; font-family: ${FONTS.body}; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${COLORS.teal};">
                  Book ${index + 1}
                </p>
                <p style="margin: 0; font-family: ${FONTS.body}; font-size: 17px; line-height: 1.5; color: ${COLORS.navy}; font-weight: 600;">
                  ${childName}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join(`
      <tr><td style="height: 10px; line-height: 10px; font-size: 0;">&nbsp;</td></tr>
  `);

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
      <tr>
        <td>
          <p style="margin: 0 0 12px 0; font-family: ${FONTS.body}; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${COLORS.navy};">
            Books in your order
          </p>
        </td>
      </tr>
      ${rows}
    </table>
  `;
}

/**
 * Build the complete branded HTML email.
 */
export function buildEmailHtml(options: EmailTemplateOptions): string {
  const { heading, body, previewImageUrl, ctaButton, infoBox, supplementalContent, childName } = options;

  // Build optional sections
  const imageSection = previewImageUrl ? buildPreviewImage(previewImageUrl, childName) : '';
  const buttonSection = ctaButton ? buildButton(ctaButton.text, ctaButton.url) : '';
  const infoSection = infoBox ? buildInfoBox(infoBox) : '';
  const supplementalSection = supplementalContent ?? '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${heading}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.offWhite}; font-family: ${FONTS.body}; -webkit-font-smoothing: antialiased;">
  <!-- Email wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.offWhite};">
    <tr>
      <td style="padding: 24px 16px;">
        <!-- Email container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: ${COLORS.white}; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          
          ${buildHeader()}
          
          <!-- Main content -->
          <tr>
            <td style="padding: 32px;">
              
              ${imageSection}
              
              <!-- Heading -->
              <h2 style="margin: 0 0 16px 0; font-family: ${FONTS.heading}; font-size: 24px; font-weight: 700; color: ${COLORS.navy}; text-align: center;">
                ${heading}
              </h2>
              
              <!-- Body -->
              <div style="font-family: ${FONTS.body}; font-size: 16px; line-height: 1.6; color: ${COLORS.charcoal};">
                ${body}
              </div>

              ${supplementalSection}
              
              ${buttonSection}
              
              ${infoSection}
              
            </td>
          </tr>
          
          ${buildFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Build a simple numbered list for "what's next" steps.
 */
export function buildStepsList(steps: string[]): string {
  return `
    <ol style="margin: 16px 0; padding-left: 24px; font-family: ${FONTS.body}; font-size: 16px; line-height: 1.8; color: ${COLORS.charcoal};">
      ${steps.map(step => `<li style="margin-bottom: 8px;">${step}</li>`).join('')}
    </ol>
  `;
}

/**
 * Build a paragraph with proper styling.
 */
export function buildParagraph(text: string): string {
  return `<p style="margin: 0 0 16px 0; font-family: ${FONTS.body}; font-size: 16px; line-height: 1.6; color: ${COLORS.charcoal};">${text}</p>`;
}

/**
 * Build emphasized/urgent text.
 */
export function buildEmphasis(text: string): string {
  return `<p style="margin: 16px 0; padding: 12px 16px; background-color: #FFF8E7; border-radius: 6px; font-family: ${FONTS.body}; font-size: 14px; color: ${COLORS.navy}; border-left: 3px solid ${COLORS.gold};">${text}</p>`;
}
