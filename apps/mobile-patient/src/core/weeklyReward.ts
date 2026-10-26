const gifts = [
  "flower-arch",
  "sunshade",
  "bookshelf",
  "picnic-mat",
  "lily-pot",
  "wind-chime",
  "star-mobile",
  "firefly-jar",
  "bridge",
  "fern",
  "gazebo",
] as const;
/** Награда превью и выдачи берётся из одного каталога, без невидимых chapter-gift ID. */
export function chapterRewardItem(index: number): string {
  return index <= 0 ? "garden" : gifts[(Math.floor(index) - 1) % gifts.length]!;
}
