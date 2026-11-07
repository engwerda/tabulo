// Runs before first paint so a dark theme never flashes light; src/client/theme.ts takes over
// once the app loads. The CSP forbids inline scripts, hence this file.
;(() => {
  let preference = null
  try {
    preference = window.localStorage.getItem("tabulo.theme")
  } catch {}
  const dark =
    preference === "dark" ||
    (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
})()
