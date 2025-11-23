import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows safe HTML tags and attributes for rich text content
 */
export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      // Text formatting
      'p', 'br', 'strong', 'em', 'u', 's', 'mark', 'sub', 'sup',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Lists
      'ul', 'ol', 'li',
      // Links
      'a',
      // Images
      'img',
      // Code
      'code', 'pre',
      // Quotes
      'blockquote',
      // Horizontal rule
      'hr',
      // Div and span for styling
      'div', 'span',
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height', 'style'],
      'p': ['style', 'class'],
      'div': ['style', 'class'],
      'span': ['style', 'class'],
      'code': ['class'],
      'pre': ['class'],
      'h1': ['style', 'class'],
      'h2': ['style', 'class'],
      'h3': ['style', 'class'],
      'h4': ['style', 'class'],
      'h5': ['style', 'class'],
      'h6': ['style', 'class'],
      'blockquote': ['style', 'class'],
      'ul': ['style', 'class'],
      'ol': ['style', 'class'],
      'li': ['style', 'class'],
    },
    allowedStyles: {
      '*': {
        // Allow text alignment
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        // Allow colors
        'color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/, /^rgba\(/],
        'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/, /^rgba\(/],
        // Allow basic sizing
        'width': [/^\d+(?:px|em|rem|%)?$/],
        'height': [/^\d+(?:px|em|rem|%)?$/],
        'max-width': [/^\d+(?:px|em|rem|%)?$/],
        'max-height': [/^\d+(?:px|em|rem|%)?$/],
        // Allow margins and padding
        'margin': [/^\d+(?:px|em|rem)?$/],
        'padding': [/^\d+(?:px|em|rem)?$/],
        // Allow display properties
        'display': [/^block$/, /^inline$/, /^inline-block$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    // Transform links to open in new tab and add noopener
    transformTags: {
      'a': (tagName, attribs) => {
        return {
          tagName: 'a',
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  });
}

/**
 * Validate HTML content length
 * @param html - HTML string to validate
 * @param maxLength - Maximum allowed length (default: 50000 characters)
 * @returns true if valid, throws error if invalid
 */
export function validateHtmlLength(html: string, maxLength: number = 50000): boolean {
  if (!html) {
    return true; // Empty is valid
  }

  if (html.length > maxLength) {
    throw new Error(`Content exceeds maximum length of ${maxLength} characters`);
  }

  return true;
}

/**
 * Strip all HTML tags and return plain text
 * Useful for search indexing or previews
 */
export function stripHtmlTags(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/**
 * Get plain text preview from HTML (first N characters)
 */
export function getHtmlPreview(html: string, maxLength: number = 200): string {
  const plainText = stripHtmlTags(html);
  if (plainText.length <= maxLength) {
    return plainText;
  }
  return plainText.substring(0, maxLength) + '...';
}
