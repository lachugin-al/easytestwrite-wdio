import { describe, it } from 'mocha';

import { setMeta } from '../../src/plugins/reporting/allure/meta.js';
import { step, s } from '../../src/plugins/reporting/allure/steps.js';
import * as a from '../../src/runtime/mobile-actions.js';
import { ExamplePage } from '../pages/example.page.js';

describe('Allure Demo', () => {
  it('Labels and custom steps', async () => {
    // Set Allure metadata (everything we configured in meta.ts)
    setMeta({
      displayName: 'Allure Demo: Steps and Labels',
      owner: 'Anton',
      epic: 'Mobile',
      feature: 'Allure',
      story: 'CustomSteps',
      severity: 'CRITICAL', // can be lowercase or UPPERCASE
      parentSuite: 'Mobile',
      suite: 'Allure Demo',
      subSuite: 'WDIO v9',
      description: 'Example of using extended metadata and custom steps.',
      tags: ['demo', 'smoke', process.env.ANDROID_DEVICE_NAME ? 'android' : 'ios'],
      issue: ['APP-123', 'Favorites icon overlaps'],
      tms: ['TMS-42', 'Allure example'],
      links: [{ url: 'https://confluence.example.com/x/Spec-123', name: 'Spec', type: 'custom' }],
      labels: {
        locale: 'ru-RU',
        build: process.env.BUILD_ID ?? 'local',
      },
      allureId: '100500',
      testId: 'TMS-42',
    });

    // (Optional) attach environment snapshot as JSON
    // attachEnvSnapshot({
    //   Platform: process.env.ANDROID_PLATFORM_VERSION
    //     ? `Android ${process.env.ANDROID_PLATFORM_VERSION}`
    //     : (process.env.IOS_PLATFORM_VERSION ? `iOS ${process.env.IOS_PLATFORM_VERSION}` : ''),
    //   Device: process.env.ANDROID_DEVICE_NAME || process.env.IOS_DEVICE_NAME || '',
    //   App: process.env.ANDROID_APP || process.env.IOS_APP
    //     || process.env.IOS_BUNDLE_ID || process.env.ANDROID_APP_PACKAGE || '',
    //   Emulator: process.env.ANDROID_EMULATOR_NAME || '',
    //   IOS_UDID: process.env.IOS_UDID || ''
    // });

    await step(
      'Open and scroll',
      async () => {
        await a.click(ExamplePage.elByName('Region'), { elementNumber: 1 });
        await a.scrollDown(2);
        await a.scrollUp(1);
      },
      { screenshot: 'always' },
    );

    await s`Attach screenshot`(
      async () => {
        await a.screenshot('after-scroll');
      },
      { screenshot: 'off' },
    );
  });
});
