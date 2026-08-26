export {};

declare global {
  interface ParentNode {
    querySelector<E extends Element = Element>(selectors: '.admin-auth__shell'): E;
  }
}
