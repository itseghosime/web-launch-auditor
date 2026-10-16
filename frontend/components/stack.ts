export const STACK_NAMES: Record<string, string> = {
  nextjs: "Next.js",
  astro: "Astro",
  remix: "Remix",
  vite: "Vite",
  wordpress: "WordPress",
  webflow: "Webflow",
  nuxt: "Nuxt",
  sveltekit: "SvelteKit",
  gatsby: "Gatsby",
  shopify: "Shopify",
  squarespace: "Squarespace",
  wix: "Wix",
  html: "Static HTML",
};

export function stackDisplayName(stack?: string | null): string {
  if (!stack) return "Web";
  const key = stack.toLowerCase().trim();
  if (STACK_NAMES[key]) {
    return STACK_NAMES[key];
  }
  return stack.charAt(0).toUpperCase() + stack.slice(1);
}

