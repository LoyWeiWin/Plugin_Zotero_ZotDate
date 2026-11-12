var yearOnlyScope;
var yearOnlyChrome;

function install() {}
function uninstall() {}

function startup({ rootURI, version }) {
  if (typeof IOUtils === "undefined" || typeof PathUtils === "undefined") {
    Components.utils.importGlobalProperties(["IOUtils", "PathUtils"]);
  }
  const registrar = Cc["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Ci.amIAddonManagerStartup);
  yearOnlyChrome = registrar.registerChrome(
    Services.io.newURI(rootURI + "manifest.json"),
    [["content", "year-only-publication-dates", "./"]]
  );
  yearOnlyScope = { Zotero, Services, IOUtils, PathUtils };
  Services.scriptloader.loadSubScript(rootURI + "parser.js", yearOnlyScope);
  Services.scriptloader.loadSubScript(rootURI + "year-only.js", yearOnlyScope);
  yearOnlyScope.YearOnlyDates.version = version;
  for (const window of Zotero.getMainWindows()) {
    yearOnlyScope.YearOnlyDates.addWindow(window);
  }
  // This is a standalone build without a hosted update feed. The reserved
  // .invalid URL satisfies Zotero's manifest requirement; disable auto-updates.
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  AddonManager.getAddonByID("year-only-publication-dates@loy.local").then(addon => {
    if (addon) addon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DISABLE;
  }).catch(error => Zotero.logError(error));
}

function onMainWindowLoad({ window }) {
  yearOnlyScope?.YearOnlyDates.addWindow(window);
}

function onMainWindowUnload({ window }) {
  yearOnlyScope?.YearOnlyDates.removeWindow(window);
}

function shutdown() {
  if (yearOnlyScope) {
    yearOnlyScope.YearOnlyDates.shutdown();
    yearOnlyScope = null;
  }
  yearOnlyChrome?.destruct();
  yearOnlyChrome = null;
}
