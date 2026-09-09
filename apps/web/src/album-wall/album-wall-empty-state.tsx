export function AlbumWallEmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <section className="album-wall-empty">
      <div aria-hidden="true" className="album-wall-empty__thread" />
      <p>OUR FIRST CHAPTER</p>
      <h1>这里还没有相册</h1>
      <span>第一段红线正等着你们，把某一天轻轻系在这里。</span>
      <button onClick={onCreate} type="button">写下第一段回忆</button>
    </section>
  );
}
