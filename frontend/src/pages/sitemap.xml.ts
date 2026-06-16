import type { APIRoute } from 'astro';

const siteUrl = (import.meta.env.PUBLIC_SITE_URL || 'https://www.littleherolabs.com').replace(/\/$/, '');

const staticPages = [
  {
    path: '/',
    lastmod: '2026-06-16',
    changefreq: 'weekly',
    priority: '1.0',
    images: [
      {
        loc: '/homepage-hero-mobile.webp',
        caption: 'Personalized children\'s book hero artwork from Little Hero Labs',
      },
      {
        loc: '/preview/cover-laney-front.png',
        caption: 'Sample cover for Finding Our Inner Voice personalized picture book',
      },
    ],
  },
  {
    path: '/our-books',
    lastmod: '2026-06-16',
    changefreq: 'weekly',
    priority: '0.8',
    images: [
      {
        loc: '/emma-inner-voice.png',
        caption: 'Finding Our Inner Voice personalized children\'s book cover',
      },
    ],
  },
  {
    path: '/how-it-works',
    lastmod: '2026-06-16',
    changefreq: 'weekly',
    priority: '0.8',
    images: [
      {
        loc: '/how-it-works-hero.webp',
        caption: 'How to create a personalized children\'s book with Little Hero Labs',
      },
    ],
  },
];

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const absoluteUrl = (path: string) => new URL(path, `${siteUrl}/`).toString();

export const GET: APIRoute = () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${absoluteUrl(page.path)}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
${page.images
  .map(
    (image) => `    <image:image>
      <image:loc>${absoluteUrl(image.loc)}</image:loc>
      <image:caption>${xmlEscape(image.caption)}</image:caption>
    </image:image>`
  )
  .join('\n')}
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
