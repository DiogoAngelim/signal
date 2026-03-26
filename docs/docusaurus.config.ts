import type { Config } from "@docusaurus/types";
import { themes } from "prism-react-renderer";

const config: Config = {
  title: "Signal",
  tagline: "A transport-agnostic application protocol",
  favicon: "img/favicon.ico",
  url: "https://diogoangelim.github.io",
  baseUrl: "/signal/",
  organizationName: "DiogoAngelim",
  projectName: "signal",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/DiogoAngelim/signal/tree/main/docs",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: "Signal",
      items: [
        { to: "/docs/introduction", label: "Docs", position: "left" },
        { to: "/docs/reference/envelope", label: "Reference", position: "left" },
        { href: "https://github.com/DiogoAngelim/signal", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Introduction", to: "/docs/introduction" },
            { label: "Quickstart", to: "/docs/guides/quickstart" },
            { label: "Envelope", to: "/docs/reference/envelope" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "Protocol", href: "https://github.com/DiogoAngelim/signal/tree/main/spec" },
            { label: "Landing", href: "https://diogoangelim.github.io/signal/" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Signal`,
    },
    prism: {
      theme: themes.github,
      darkTheme: themes.dracula,
    },
  },
};

export default config;
