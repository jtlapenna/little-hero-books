/**
 * Amazon Customization Parser
 * Parses Amazon Custom product customization data from ZIP files
 */

interface AmazonCustomizationData {
  orderId: string;
  orderItemId: string;
  customizationData: {
    children: Array<{
      children: Array<{
        children: Array<{
          type: string;
          label: string;
          name?: string;
          inputValue?: string;
          displayValue?: string;
          optionSelection?: {
            name: string;
            label: string;
          };
        }>;
      }>;
    }>;
  };
  'version3.0'?: {
    customizationInfo: {
      surfaces: Array<{
        areas: Array<{
          label: string;
          text?: string;
          optionValue?: string;
          customizationType: string;
        }>;
      }>;
    };
  };
}

/**
 * Parse Amazon customization JSON and extract character specs
 * Maps Amazon format to our character_specs format
 */
export function parseAmazonCustomization(jsonData: AmazonCustomizationData): {
  childName: string;
  age: string;
  pronouns: string;
  skinTone: string;
  hairColor: string;
  hairStyle: string;
  favoriteColor: string;
  animalGuide: string;
  hometown?: string;
  dedication?: string;
} | null {
  try {
    // Use version3.0 format if available (simpler structure)
    if (jsonData['version3.0']?.customizationInfo?.surfaces?.[0]?.areas) {
      const areas = jsonData['version3.0'].customizationInfo.surfaces[0].areas;
      const specs: any = {};
      
      for (const area of areas) {
        const label = area.label?.toLowerCase() || '';
        
        if (label.includes("child's first name") || label.includes("child name")) {
          specs.childName = area.text || '';
        } else if (label.includes("hometown")) {
          specs.hometown = area.text || '';
        } else if (label.includes("child's age") || label.includes("age")) {
          specs.age = area.optionValue || area.text || '';
        } else if (label.includes("gender") || label.includes("pronouns")) {
          specs.pronouns = area.optionValue || area.text || '';
        } else if (label.includes("skin tone")) {
          specs.skinTone = area.optionValue || '';
        } else if (label.includes("hair color")) {
          specs.hairColor = area.optionValue || '';
        } else if (label.includes("hair style")) {
          specs.hairStyle = area.optionValue || '';
        } else if (label.includes("favorite color")) {
          specs.favoriteColor = area.optionValue || '';
        } else if (label.includes("animal guide") || label.includes("favorite animal")) {
          specs.animalGuide = area.optionValue || '';
        } else if (label.includes("dedication")) {
          specs.dedication = area.text || '';
        }
      }
      
      // Validate required fields
      if (!specs.childName || !specs.age) {
        return null;
      }
      
      return {
        childName: specs.childName,
        age: specs.age,
        pronouns: specs.pronouns || 'they/them',
        skinTone: normalizeSkinTone(specs.skinTone || 'medium'),
        hairColor: normalizeHairColor(specs.hairColor || 'brown'),
        hairStyle: normalizeHairStyle(specs.hairStyle || 'short/straight'),
        favoriteColor: specs.favoriteColor || 'blue',
        animalGuide: specs.animalGuide || 'dog',
        hometown: specs.hometown,
        dedication: specs.dedication,
      };
    }
    
    // Fallback to nested customizationData structure
    if (jsonData.customizationData?.children?.[0]?.children?.[0]?.children) {
      const children = jsonData.customizationData.children[0].children[0].children;
      const specs: any = {};
      
      for (const child of children) {
        if (child.children) {
          // Text input fields
          for (const textChild of child.children) {
            const label = textChild.label?.toLowerCase() || '';
            if (label.includes("child's first name") || label.includes("child name")) {
              specs.childName = textChild.inputValue || '';
            } else if (label.includes("hometown")) {
              specs.hometown = textChild.inputValue || '';
            } else if (label.includes("dedication")) {
              specs.dedication = textChild.inputValue || '';
            }
          }
        } else {
          // Option dropdowns
          const label = child.label?.toLowerCase() || '';
          const value = child.displayValue || child.optionSelection?.name || '';
          
          if (label.includes("child's age") || label.includes("age")) {
            specs.age = value;
          } else if (label.includes("gender") || label.includes("pronouns")) {
            specs.pronouns = value;
          } else if (label.includes("skin tone")) {
            specs.skinTone = value;
          } else if (label.includes("hair color")) {
            specs.hairColor = value;
          } else if (label.includes("hair style")) {
            specs.hairStyle = value;
          } else if (label.includes("favorite color")) {
            specs.favoriteColor = value;
          } else if (label.includes("animal guide") || label.includes("favorite animal")) {
            specs.animalGuide = value;
          }
        }
      }
      
      // Validate required fields
      if (!specs.childName || !specs.age) {
        return null;
      }
      
      return {
        childName: specs.childName,
        age: specs.age,
        pronouns: normalizePronouns(specs.pronouns || 'they/them'),
        skinTone: normalizeSkinTone(specs.skinTone || 'medium'),
        hairColor: normalizeHairColor(specs.hairColor || 'brown'),
        hairStyle: normalizeHairStyle(specs.hairStyle || 'short/straight'),
        favoriteColor: specs.favoriteColor || 'blue',
        animalGuide: specs.animalGuide || 'dog',
        hometown: specs.hometown,
        dedication: specs.dedication,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Amazon Customization Parser] Error parsing customization:', error);
    return null;
  }
}

/**
 * Normalize skin tone values to our format
 */
function normalizeSkinTone(value: string): string {
  const normalized = value.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'tan': 'tan',
    'medium': 'medium',
    'light': 'light',
    'dark': 'dark',
    'fair': 'light',
    'olive': 'tan',
  };
  return mapping[normalized] || normalized || 'medium';
}

/**
 * Normalize hair color values to our format
 */
function normalizeHairColor(value: string): string {
  const normalized = value.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'auburn': 'auburn',
    'brown': 'brown',
    'black': 'black',
    'blonde': 'blonde',
    'red': 'red',
    'strawberry blonde': 'strawberry-blonde',
    'strawberry-blonde': 'strawberry-blonde',
  };
  return mapping[normalized] || normalized || 'brown';
}

/**
 * Normalize hair style values to our format
 */
function normalizeHairStyle(value: string): string {
  const normalized = value.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'curly crop': 'curly-crop',
    'curly-crop': 'curly-crop',
    'short/straight': 'short-straight',
    'long/straight': 'long-straight',
    'afro': 'afro',
  };
  return mapping[normalized] || normalized || 'short-straight';
}

/**
 * Normalize pronouns values to our format
 */
function normalizePronouns(value: string): string {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'he' || normalized === 'him') return 'he/him';
  if (normalized === 'she' || normalized === 'her') return 'she/her';
  if (normalized === 'they' || normalized === 'them') return 'they/them';
  return normalized || 'they/them';
}

