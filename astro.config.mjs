import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { readFile, writeFile } from 'node:fs/promises';
import {
  isGazeLauncherPublicEnabled,
  isGazeLauncherSitemapEntryIncluded,
} from './src/lib/gaze-launcher-visibility.ts';
import remarkGazeLauncherVisibility from './src/plugins/remark-gaze-launcher-visibility.ts';
import { resolveSiteOrigin, rewriteRobotsSitemapOrigins } from './src/lib/site-origin.ts';
import localeSsrRoutes from './src/plugins/locale-ssr-routes.mjs';
import { r2WorkerSdkRuntime } from './scripts/lib/r2-worker-sdk-runtime.mjs';

const gazeLauncherPublicEnabled = isGazeLauncherPublicEnabled();
const siteOrigin = resolveSiteOrigin(process.env.SITE_ORIGIN);

function siteOriginRobots() {
  return {
    name: 'openglass-site-origin-robots',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        let rewritten = 0;
        for (const relativePath of ['client/robots.txt', 'robots.txt']) {
          const robotsUrl = new URL(relativePath, dir);
          try {
            const source = await readFile(robotsUrl, 'utf8');
            await writeFile(robotsUrl, rewriteRobotsSitemapOrigins(source, siteOrigin), 'utf8');
            rewritten += 1;
          } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
          }
        }
        if (rewritten === 0) throw new Error('Built robots.txt was not found');
      },
    },
  };
}

export default defineConfig({
  vite: { plugins: [r2WorkerSdkRuntime()] },
  site: siteOrigin,
  output: 'static',
  markdown: {
    remarkPlugins: [remarkGazeLauncherVisibility],
  },
  redirects: {
    '/gaze-os': '/gaze-launcher/',
    '/reference/guides-docs': '/guides/',
    '/reference/devices-docs': '/devices/',
    '/reference/developers-docs': '/developers/',
    '/reference/gaze-launcher-docs': '/gaze-launcher/',
    '/community': '/feed/',
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    prerenderEnvironment: 'node',
  }),
  integrations: [
    sitemap({
      filter: isGazeLauncherSitemapEntryIncluded,
    }),
    react(),
    starlight({
      prerender: false,
      pagefind: false,
      routeMiddleware: './src/starlightRouteData.ts',
      disable404Route: true,
      title: 'Lensden',
      description: 'AR/AI 眼镜知识库、选购指南与开发者资源',
      components: {
        Header: './src/components/starlight/Header.astro',
        ThemeProvider: './src/components/starlight/ThemeProvider.astro',
        ThemeSelect: './src/components/starlight/ThemeSelect.astro',
      },
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      favicon: '/gaze-icon-v6.ico',
      logo: {
      src: './public/brand/openglass-nav-logo.png',
        alt: 'Lensden',
        replacesTitle: false,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/openglass-hub' },
      ],
      head: [
        { tag: 'meta', attrs: { name: 'author', content: 'Jayden' } },
        { tag: 'meta', attrs: { name: 'application-name', content: 'Lensden' } },
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            type: 'image/x-icon',
            href: '/gaze-icon-v6.ico',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            type: 'image/svg+xml',
            href: '/gaze-icon-v6.svg',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            type: 'image/png',
            sizes: '32x32',
            href: '/gaze-icon-32-v6.png',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            type: 'image/png',
            sizes: '192x192',
            href: '/gaze-icon-192-v6.png',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'apple-touch-icon',
            sizes: '180x180',
            href: '/apple-touch-icon-v6.png',
          },
        },
      ],
      sidebar: [
        {
          label: '设备库',
          link: '/devices',
        },
        {
          label: '选购指南',
          link: '/guides',
        },
        {
          label: '开发者',
          link: '/developers',
        },
        ...(gazeLauncherPublicEnabled ? [{
          label: 'Gaze Launcher',
          link: '/gaze-launcher',
        }] : []),
        {
          label: '关于',
          link: '/about',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      expressiveCode: {
        themes: ['github-dark'],
      },
    }),
    localeSsrRoutes(),
    siteOriginRobots(),
  ],
});
