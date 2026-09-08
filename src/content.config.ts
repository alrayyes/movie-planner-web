import { defineCollection, z } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { changelogLoader } from "./lib/changelog/loader";

const changelogEntrySchema = z.object({
  type: z.enum(["feature", "fix"]),
  scope: z.string(),
  description: z.string(),
  prNumber: z.number(),
  prUrl: z.string().url(),
});

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // #369: one entry per release with at least one end-user-relevant
  // change — see loader.ts/parse.ts for where the filtering happens.
  changelog: defineCollection({
    loader: changelogLoader(),
    schema: z.object({
      version: z.string(),
      date: z.string(),
      entries: z.array(changelogEntrySchema),
    }),
  }),
};
