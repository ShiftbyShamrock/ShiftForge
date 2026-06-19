import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The Forge page — serves the complete SHIFT Forge HTML app.
 * This preserves the existing v5 HTML (styles, JS, canvas rendering)
 * as a Next.js page while enabling API routes at /api/*.
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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />
      <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
    </>
  );
}
