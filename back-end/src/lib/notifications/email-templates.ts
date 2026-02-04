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

// Email-safe fonts
const FONTS = {
  heading: "Georgia, 'Times New Roman', serif",
  body: "Arial, Helvetica, sans-serif",
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
  /** Child's name for personalization */
  childName?: string;
}

/**
 * Build the branded header with coral bar, logo, and brand name.
 */
function buildHeader(): string {
  return `
    <!-- Header -->
    <tr>
      <td style="background-color: ${COLORS.coral}; padding: 24px 32px; text-align: center;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
          <tr>
            <td style="vertical-align: middle; padding-right: 12px;">
              <img src="${LOGO_URL}" alt="Little Hero Labs" width="48" height="48" style="display: block; border-radius: 8px;" />
            </td>
            <td style="vertical-align: middle;">
              <span style="font-family: ${FONTS.heading}; font-size: 28px; font-weight: 700; color: ${COLORS.white}; letter-spacing: 0.5px;">
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
 * Build the footer with tagline.
 */
function buildFooter(): string {
  return `
    <!-- Footer -->
    <tr>
      <td style="background-color: ${COLORS.lightGray}; padding: 24px 32px; text-align: center; border-top: 1px solid #E0E0E0;">
        <p style="margin: 0 0 8px 0; font-family: ${FONTS.heading}; font-size: 14px; font-style: italic; color: ${COLORS.navy};">
          "Every child is the hero of their own story."
        </p>
        <p style="margin: 0; font-family: ${FONTS.body}; font-size: 12px; color: #888888;">
          Little Hero Labs • <a href="https://littleherolabs.com" style="color: ${COLORS.teal}; text-decoration: none;">littleherolabs.com</a>
        </p>
      </td>
    </tr>
  `;
}

/**
 * Build a CTA button.
 */
function buildButton(text: string, url: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px auto;">
      <tr>
        <td style="border-radius: 8px; background-color: ${COLORS.teal};">
          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: ${FONTS.body}; font-size: 16px; font-weight: 600; color: ${COLORS.white}; text-decoration: none; border-radius: 8px;">
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
        <td style="background-color: ${COLORS.lightGray}; padding: 20px 24px; border-radius: 8px; border-left: 4px solid ${COLORS.coral};">
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
            width="200" 
            style="display: block; margin: 0 auto; max-width: 200px; height: auto; border-radius: 12px; border: 3px solid ${COLORS.gold};"
          />
        </td>
      </tr>
    </table>
  `;
}

/**
 * Build the complete branded HTML email.
 */
export function buildEmailHtml(options: EmailTemplateOptions): string {
  const { heading, body, previewImageUrl, ctaButton, infoBox, childName } = options;

  // Build optional sections
  const imageSection = previewImageUrl ? buildPreviewImage(previewImageUrl, childName) : '';
  const buttonSection = ctaButton ? buildButton(ctaButton.text, ctaButton.url) : '';
  const infoSection = infoBox ? buildInfoBox(infoBox) : '';

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
