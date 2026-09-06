"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable.
 *
 * `public/sw.js` and `public/manifest.webmanifest` had been sitting in the
 * repository unreferenced — nothing in the app linked the manifest or called
 * register(), so Chrome never offered "Install app" and the files did nothing
 * at all.
 *
 * Registration waits for `load`. A service worker installing during the first
 * paint competes with the page for the network on exactly the connection least
 * able to spare it, and it is not needed until the second visit anyway.
 *
 * Every failure is swallowed. Registration throws on plain HTTP, in private
 * windows, and wherever a browser or a policy has disabled workers — none of
 * which should stop somebody scoring a match.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
