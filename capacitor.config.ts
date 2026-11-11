import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sonevalley.cement",
  appName: "Sonevalley",
  webDir: "www",
  server: {
    url: "https://cement.buildcity.cloud",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
