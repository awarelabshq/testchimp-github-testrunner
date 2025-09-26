import { Page } from 'playwright';

export interface PageInfo {
  url: string;
  title: string;
  elements: string;
  formFields: string;
  interactiveElements: string;
  pageStructure: string;
}

export async function getEnhancedPageInfo(page: Page): Promise<PageInfo>;
export async function getEnhancedPageInfo(domSnapshot: { url: string; title: string; accessibilityTree: any }): Promise<PageInfo>;
export async function getEnhancedPageInfo(input: Page | { url: string; title: string; accessibilityTree: any }): Promise<PageInfo> {
  let domSnapshot: { url: string; title: string; accessibilityTree: any } = { url: 'Unknown', title: 'Unknown', accessibilityTree: null };
  
  try {
    if ('accessibility' in input) {
      // Input is a Page object
      const snapshot = await input.accessibility.snapshot();
      const url = input.url();
      const title = await input.title();
      domSnapshot = { url, title, accessibilityTree: snapshot };
    } else {
      // Input is already a domSnapshot
      domSnapshot = input;
    }

    // Extract key information from accessibility tree
    const elements: string[] = [];
    const formFields: string[] = [];
    const interactiveElements: string[] = [];
    const pageStructure: string[] = [];

    const extractElements = (node: any, depth = 0) => {
      if (depth > 4) return; // Limit depth to avoid overwhelming output
      
      if (node && typeof node === 'object') {
        if (node.role) {
          const elementInfo = `${node.role}${node.name ? `: ${node.name}` : ''}`;
          elements.push(elementInfo);

          // Categorize elements
          if (['textbox', 'button', 'link', 'checkbox', 'radio', 'combobox', 'slider'].includes(node.role)) {
            interactiveElements.push(elementInfo);
          }
          
          if (['textbox', 'checkbox', 'radio', 'combobox', 'slider'].includes(node.role)) {
            formFields.push(elementInfo);
          }

          if (['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'search'].includes(node.role)) {
            pageStructure.push(elementInfo);
          }
        }

        if (node.children) {
          node.children.forEach((child: any) => extractElements(child, depth + 1));
        }
      }
    };

    extractElements(domSnapshot.accessibilityTree);

    // Create a more focused summary
    const getElementSummary = (elementList: string[], maxItems: number, category: string) => {
      if (elementList.length === 0) return `No ${category} found`;
      const limited = elementList.slice(0, maxItems);
      const remaining = elementList.length - maxItems;
      const summary = limited.join(', ');
      return remaining > 0 ? `${summary} (+${remaining} more)` : summary;
    };

    return {
      url: domSnapshot.url,
      title: domSnapshot.title,
      elements: getElementSummary(elements, 15, 'elements'),
      formFields: getElementSummary(formFields, 8, 'form fields'),
      interactiveElements: getElementSummary(interactiveElements, 12, 'interactive elements'),
      pageStructure: getElementSummary(pageStructure, 6, 'page sections')
    };
  } catch (error) {
    console.error('Error extracting page info:', error);
    return {
      url: domSnapshot?.url || 'Unknown',
      title: 'Unknown',
      elements: 'Unable to extract',
      formFields: 'Unable to extract',
      interactiveElements: 'Unable to extract',
      pageStructure: 'Unable to extract'
    };
  }
}
