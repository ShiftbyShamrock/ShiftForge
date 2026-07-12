import { readFileSync } from 'fs';
import { join } from 'path';
import ForgeClientWrapper from './ForgeClientWrapper';

/**
 * The Forge page — serves the complete SHIFT Forge HTML app.
 * This preserves the existing v20 HTML (styles, JS, canvas rendering)
 * as a Next.js page while enabling API routes at /api/*.
 *
 * It delegates to ForgeClientWrapper (a Client Component) which dynamically
 * imports the main client renderer with SSR disabled to bypass hydration issues.
 */
export default function ForgePage() {
  // Read the Forge HTML at build time
  const forgeHtml = readFileSync(
    join(process.cwd(), 'shift-forge-v20.html'),
    'utf-8'
  );

  // Extract the content between <body> and </body>
  const bodyMatch = forgeHtml.match(/<body>([\s\S]*?)<\/body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';

  // Extract the <style> block
  const styleMatch = forgeHtml.match(/<style>([\s\S]*?)<\/style>/);
  const styleContent = styleMatch ? styleMatch[1] : '';

  // Extract inline <script> content (the main SHIFT Forge app logic)
  const inlineScriptMatch = bodyContent.match(/<script>([\s\S]*?)<\/script>/);
  const inlineScript = inlineScriptMatch ? inlineScriptMatch[1] : '';

  // Remove ALL <script> tags from the body content to avoid broken dangerouslySetInnerHTML scripts
  const cleanBodyContent = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, function(match) {
      // Keep non-script-related comments
      if (match.toLowerCase().includes('solana') || match.toLowerCase().includes('script')) return '';
      return match;
    });

  return (
    <ForgeClientWrapper
      styleContent={styleContent}
      cleanBodyContent={cleanBodyContent}
      inlineScript={inlineScript}
    />
  );
}
