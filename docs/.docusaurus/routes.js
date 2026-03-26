import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/signal/docs',
    component: ComponentCreator('/signal/docs', 'b53'),
    routes: [
      {
        path: '/signal/docs',
        component: ComponentCreator('/signal/docs', '2df'),
        routes: [
          {
            path: '/signal/docs',
            component: ComponentCreator('/signal/docs', '679'),
            routes: [
              {
                path: '/signal/docs/concepts/events',
                component: ComponentCreator('/signal/docs/concepts/events', '0db'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/concepts/idempotency',
                component: ComponentCreator('/signal/docs/concepts/idempotency', '481'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/concepts/mutations',
                component: ComponentCreator('/signal/docs/concepts/mutations', '4ec'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/concepts/order-and-replay',
                component: ComponentCreator('/signal/docs/concepts/order-and-replay', '978'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/concepts/queries',
                component: ComponentCreator('/signal/docs/concepts/queries', '02d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/concepts/versioning',
                component: ComponentCreator('/signal/docs/concepts/versioning', '45a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/examples/escrow-release-flow',
                component: ComponentCreator('/signal/docs/examples/escrow-release-flow', 'aad'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/examples/payment-capture-flow',
                component: ComponentCreator('/signal/docs/examples/payment-capture-flow', '409'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/examples/user-onboarding-flow',
                component: ComponentCreator('/signal/docs/examples/user-onboarding-flow', 'c2d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/guides/define-your-first-mutation',
                component: ComponentCreator('/signal/docs/guides/define-your-first-mutation', 'b8a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/guides/define-your-first-query',
                component: ComponentCreator('/signal/docs/guides/define-your-first-query', '1fb'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/guides/emit-and-consume-events',
                component: ComponentCreator('/signal/docs/guides/emit-and-consume-events', 'fde'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/guides/http-binding',
                component: ComponentCreator('/signal/docs/guides/http-binding', 'a11'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/guides/in-process-runtime',
                component: ComponentCreator('/signal/docs/guides/in-process-runtime', '8dd'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/guides/quickstart',
                component: ComponentCreator('/signal/docs/guides/quickstart', '2e1'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/introduction',
                component: ComponentCreator('/signal/docs/introduction', '674'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/reference/capabilities',
                component: ComponentCreator('/signal/docs/reference/capabilities', '354'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/reference/conformance',
                component: ComponentCreator('/signal/docs/reference/conformance', '762'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/reference/envelope',
                component: ComponentCreator('/signal/docs/reference/envelope', '334'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/signal/docs/reference/errors',
                component: ComponentCreator('/signal/docs/reference/errors', '9a9'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/signal/',
    component: ComponentCreator('/signal/', 'd67'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
