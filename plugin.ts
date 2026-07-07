import fs from "node:fs";
import path from "node:path";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { WebHostService } from "@tokenring-ai/web-host";
import SPAResource from "@tokenring-ai/web-host/SPAResource";
import { z } from "zod";
import packageJSON from "./package.json" with { type: "json" };

const packageConfigSchema = z.object({
  oneFrontend: z.object({
    spaDirectory: z.string(),
  }),
});

export default {
  name: packageJSON.name,
  displayName: "Chat Frontend",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    const indexFile = path.resolve(config.oneFrontend.spaDirectory, "index.html");
    if (!fs.existsSync(indexFile)) {
      throw new Error(`One frontend not found at ${indexFile}`);
    }

    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource(
        "Agent Web Interface",
        new SPAResource({
          type: "spa",
          description: packageJSON.description,
          file: indexFile,
          prefix: "/chat",
        }),
      );
    });
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
