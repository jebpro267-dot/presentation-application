const projectVersion = 1;

function isRecord(value) {
  return value !== null && typeof value === "object";
}

function isProject(value) {
  const hasValidScenes =
    isRecord(value) &&
    Array.isArray(value.scenes) &&
    value.scenes.every(
      (scene) =>
        isRecord(scene) &&
        typeof scene.id === "string" &&
        typeof scene.name === "string" &&
        typeof scene.color === "string" &&
        typeof scene.description === "string",
    );
  const hasValidSlides =
    isRecord(value) &&
    Array.isArray(value.slides) &&
    value.slides.every(
      (slide) =>
        isRecord(slide) &&
        typeof slide.id === "string" &&
        typeof slide.title === "string" &&
        typeof slide.body === "string" &&
        typeof slide.background === "string" &&
        (slide.kind === undefined ||
          ["slide", "song", "scripture"].includes(slide.kind)) &&
        (slide.section === undefined || typeof slide.section === "string") &&
        (slide.songGroup === undefined || typeof slide.songGroup === "string") &&
        (slide.backgroundEnd === undefined || /^#[\da-f]{6}$/i.test(slide.backgroundEnd)) &&
        ((slide.mediaUrl === undefined && slide.mediaType === undefined) ||
          (typeof slide.mediaUrl === "string" &&
            /^data:(image|video)\/[\w.+-]+;base64,/.test(slide.mediaUrl) &&
            ["image", "video"].includes(slide.mediaType))) &&
        (slide.textColor === undefined || /^#[\da-f]{6}$/i.test(slide.textColor)) &&
        (slide.fontSize === undefined ||
          (Number.isInteger(slide.fontSize) &&
            slide.fontSize >= 12 &&
            slide.fontSize <= 120)) &&
        (slide.textAlign === undefined ||
          ["left", "center", "right"].includes(slide.textAlign)),
    );

  return (
    isRecord(value) &&
    value.version === projectVersion &&
    typeof value.name === "string" &&
    (value.liveLayout === undefined ||
      ["center", "lower-third", "title-only", "lyrics"].includes(value.liveLayout)) &&
    (value.liveElements === undefined ||
      (isRecord(value.liveElements) &&
        typeof value.liveElements.title === "boolean" &&
        typeof value.liveElements.body === "boolean" &&
        typeof value.liveElements.background === "boolean")) &&
    hasValidScenes &&
    hasValidSlides &&
    typeof value.currentSceneId === "string" &&
    value.scenes.some((scene) => scene.id === value.currentSceneId) &&
    (value.liveSlideId === null ||
      (typeof value.liveSlideId === "string" &&
        value.slides.some((slide) => slide.id === value.liveSlideId)))
  );
}

module.exports = { isProject };
