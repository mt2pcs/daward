export function thumbUrl(
  youtubeId: string,
  quality: "mq" | "hq" | "maxres" = "mq"
): string {
  const name =
    quality === "maxres"
      ? "maxresdefault"
      : quality === "hq"
        ? "hqdefault"
        : "mqdefault";
  return `https://i.ytimg.com/vi/${youtubeId}/${name}.jpg`;
}

export function embedUrl(
  youtubeId: string,
  opts: { autoplay?: boolean; mute?: boolean; loop?: boolean; controls?: boolean } = {}
): string {
  const p = new URLSearchParams();
  if (opts.autoplay) p.set("autoplay", "1");
  if (opts.mute) p.set("mute", "1");
  if (opts.controls === false) p.set("controls", "0");
  if (opts.loop) {
    p.set("loop", "1");
    p.set("playlist", youtubeId);
  }
  p.set("playsinline", "1");
  p.set("rel", "0");
  p.set("modestbranding", "1");
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${p.toString()}`;
}
