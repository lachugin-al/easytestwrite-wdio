import { PageElement } from '../../src/core/locators/page-element.js';

export class ExamplePage {
  /**
   * "Region"
   *
   * - **Android:** UiSelector.text("Region")
   * - **iOS:** NSPredicate (name/label/value == "Region")
   * - **Fallback:** ~Region (accessibility id, if actually present in the app)
   */
  static readonly region = PageElement.byTextExact('Region').withFallbacks({
    universal: PageElement.AccessibilityId('Region'),
  });

  /**
   * Element by a given name (parameterized version of {@link region}).
   *
   * @param name Display text to match.
   */
  static elByName(name: string) {
    return PageElement.byTextExact(name).withFallbacks({
      universal: PageElement.AccessibilityId(name),
    });
  }

  /**
   * "Not now"
   */
  static readonly notNow = PageElement.byTextExact('Not now').withFallbacks({
    universal: PageElement.AccessibilityId('Not now'),
  });

  /**
   * Product card: product image.
   *
   * Primary locator is accessibility id; platform-specific fallbacks are added.
   */
  static readonly cardImage = PageElement.byAccessibilityId('Product image').withFallbacks({
    android: PageElement.AndroidUIAutomator(
      'new UiSelector().descriptionContains("Product image")',
    ),
    ios: PageElement.IOSPredicateString(
      'name == "Product image" OR label == "Product image" OR value == "Product image"',
    ),
  });

  /**
   * Product card: "Add to favorites" button.
   *
   * Primary locator is accessibility id; platform-specific fallbacks are added.
   */
  static readonly cardFavorites = PageElement.byAccessibilityId('Add to favorites').withFallbacks({
    android: PageElement.AndroidUIAutomator(
      'new UiSelector().descriptionContains("Add to favorites")',
    ),
    ios: PageElement.IOSPredicateString(
      'name == "Add to favorites" OR label == "Add to favorites" OR value == "Add to favorites"',
    ),
  });
}

export default ExamplePage;
