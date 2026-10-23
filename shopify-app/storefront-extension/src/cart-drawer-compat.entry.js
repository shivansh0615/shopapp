/**
 * Entry for optional asset extensions/.../assets/cart-drawer-compat.js
 * Must not be imported by the core free-gift-progress-bar bundle.
 */
import { BOOT_FLAG, installCartDrawerCompat } from "./compat/cart-drawer-compat.js";

(function () {
  if (typeof window !== "undefined" && window[BOOT_FLAG]) return;
  installCartDrawerCompat();
})();
