const test = require("node:test");
const assert = require("node:assert/strict");
const { isProject } = require("../electron/project.cjs");

const validProject = {
  version: 1,
  name: "Show",
  scenes: [
    { id: "scene-1", name: "Wide", color: "#223344", description: "Main view" },
  ],
  slides: [
    {
      id: "slide-1",
      title: "Welcome",
      body: "Hello",
      background: "#334455",
    },
  ],
  currentSceneId: "scene-1",
  liveSlideId: "slide-1",
};

test("accepts a versioned project with valid scene and slide references", () => {
  assert.equal(isProject(validProject), true);
});

test("accepts a project with no live slide", () => {
  assert.equal(isProject({ ...validProject, liveSlideId: null }), true);
});

test("accepts editorial formatting on presentation and lyric slides", () => {
  assert.equal(
    isProject({
      ...validProject,
      slides: [
        {
          ...validProject.slides[0],
          kind: "song",
          section: "Chorus",
          textColor: "#fefefe",
          fontSize: 48,
          textAlign: "left",
        },
      ],
    }),
    true,
  );
});

test("accepts song groups, embedded backgrounds, and live output settings", () => {
  assert.equal(
    isProject({
      ...validProject,
      liveLayout: "lower-third",
      liveElements: { title: true, body: false, background: true },
      slides: [{
        ...validProject.slides[0],
        kind: "song",
        section: "Verse 1",
        songGroup: "Opening song",
        backgroundEnd: "#ffffff",
        mediaUrl: "data:image/png;base64,aGVsbG8=",
        mediaType: "image",
      }],
    }),
    true,
  );
});

test("rejects unsupported live settings and malformed media", () => {
  assert.equal(isProject({ ...validProject, liveLayout: "unsupported" }), false);
  assert.equal(
    isProject({
      ...validProject,
      slides: [{ ...validProject.slides[0], mediaUrl: "https://example.test/bg.png", mediaType: "image" }],
    }),
    false,
  );
});

test("rejects unsupported versions and malformed collection entries", () => {
  assert.equal(isProject({ ...validProject, version: 2 }), false);
  assert.equal(
    isProject({ ...validProject, slides: [null] }),
    false,
  );
  assert.equal(
    isProject({
      ...validProject,
      slides: [{ ...validProject.slides[0], fontSize: 400 }],
    }),
    false,
  );
});

test("rejects references to missing scenes or slides", () => {
  assert.equal(
    isProject({ ...validProject, currentSceneId: "missing" }),
    false,
  );
  assert.equal(isProject({ ...validProject, liveSlideId: "missing" }), false);
});

test("rejects null and non-project values", () => {
  assert.equal(isProject(null), false);
  assert.equal(isProject([]), false);
});
