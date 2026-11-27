import { fireEvent } from '@testing-library/react';

export const fireAnimationEvent = (
  element: Element,
  type: 'animationend' | 'animationcancel',
  animationName: string
): void => {
  // jsdom does not expose AnimationEvent, so the event needs the CSS animation name explicitly.
  fireEvent(element, Object.assign(new Event(type, { bubbles: true }), { animationName }));
};
