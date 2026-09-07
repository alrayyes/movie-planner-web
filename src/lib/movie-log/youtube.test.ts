import { describe, expect, test } from "bun:test";
import { youtubeEmbedUrl, youtubeVideoId } from "./youtube";

describe("youtubeVideoId", () => {
  test.each([
    ["https://www.youtube.com/watch?v=8g18jFHCLXk", "8g18jFHCLXk"],
    ["https://youtube.com/watch?v=8g18jFHCLXk", "8g18jFHCLXk"],
    ["https://m.youtube.com/watch?v=8g18jFHCLXk", "8g18jFHCLXk"],
    ["https://www.youtube.com/watch?v=8g18jFHCLXk&t=42s", "8g18jFHCLXk"],
    ["https://youtu.be/8g18jFHCLXk", "8g18jFHCLXk"],
    ["https://youtu.be/8g18jFHCLXk?t=42", "8g18jFHCLXk"],
    ["https://www.youtube.com/embed/8g18jFHCLXk", "8g18jFHCLXk"],
    ["https://www.youtube.com/shorts/8g18jFHCLXk", "8g18jFHCLXk"],
    ["http://www.youtube.com/watch?v=8g18jFHCLXk", "8g18jFHCLXk"],
  ])("extracts the video ID from %s", (url, expected) => {
    expect(youtubeVideoId(url)).toBe(expected);
  });

  test("returns null for a non-YouTube URL", () => {
    expect(youtubeVideoId("https://vimeo.com/12345678")).toBeNull();
  });

  test("returns null for an unrecognizable YouTube-ish URL", () => {
    expect(youtubeVideoId("https://www.youtube.com/channel/UC1234")).toBeNull();
  });
});

describe("youtubeEmbedUrl", () => {
  test("builds a youtube-nocookie.com embed URL", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=8g18jFHCLXk")).toBe(
      "https://www.youtube-nocookie.com/embed/8g18jFHCLXk",
    );
  });

  test("returns null when the URL isn't a recognizable YouTube link", () => {
    expect(youtubeEmbedUrl("https://vimeo.com/12345678")).toBeNull();
  });
});
