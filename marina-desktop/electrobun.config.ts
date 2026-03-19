export default {
  app: {
    name: "Marina",
    identifier: "dev.marina.desktop",
    version: "0.1.0",
  },

  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      dashboard: {
        entrypoint: "src/views/dashboard/index.ts",
      },
    },
    copy: {
      // Dashboard SPA build output
      "dist/dashboard": "views/dashboard/app",
      // Room definitions for the engine
      "../rooms": "resources/rooms",
      // View HTML shell
      "src/views/dashboard/index.html": "views/dashboard/index.html",
      // Tray icons
      "assets/tray-icon.png": "resources/tray-icon.png",
      "assets/tray-icon-active.png": "resources/tray-icon-active.png",
    },
  },

  mac: {
    icon: "assets/icon.icns",
    codeSign: false,
    notarize: false,
  },

  release: {
    baseUrl: "",
  },
};
